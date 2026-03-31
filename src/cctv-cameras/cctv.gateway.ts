import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CctvRecordingsService } from './cctv-recordings.service';

export interface LiveCameraInfo {
    cameraId: string;
    socketId: string;
    campaignId: string;
    name: string;
    checkpointId?: string;
    checkpointName?: string;
    location?: string;
    description?: string;
    deviceId?: string;
    connectedAt: Date;
}

@WebSocketGateway({
    namespace: '/cctv',
    cors: { origin: '*' },
})
export class CctvGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private cameras = new Map<string, LiveCameraInfo>();
    private initChunks = new Map<string, { chunk: Buffer; mimeType: string }>();
    private recentChunks = new Map<string, { chunk: Buffer; mimeType: string }[]>();
    private static readonly MAX_RECENT_CHUNKS = 5;

    constructor(private readonly recordingsService: CctvRecordingsService) {}

    handleConnection(client: Socket) {
        console.log(`[CCTV] client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        const cam = this.cameras.get(client.id);
        if (cam) {
            this.cameras.delete(client.id);
            this.initChunks.delete(cam.cameraId);
            this.recentChunks.delete(cam.cameraId);
            console.log(`[CCTV] camera offline: ${cam.name} (${cam.cameraId})`);
            this.server
                .to(`campaign:${cam.campaignId}`)
                .emit('camera:offline', { cameraId: cam.cameraId });
            this.recordingsService.finalizeRecording(cam.cameraId).catch(() => {});
        }
    }

    @SubscribeMessage('camera:register')
    handleCameraRegister(client: Socket, data: Partial<LiveCameraInfo>) {
        const cameraId = `cam_${client.id.substring(0, 10)}`;
        const info: LiveCameraInfo = {
            cameraId,
            socketId: client.id,
            campaignId: data.campaignId || '',
            name: data.name || 'Unknown Camera',
            checkpointId: data.checkpointId,
            checkpointName: data.checkpointName,
            location: data.location,
            description: data.description,
            deviceId: data.deviceId,
            connectedAt: new Date(),
        };
        this.cameras.set(client.id, info);
        client.join(`camera:${cameraId}`);
        console.log(`[CCTV] camera online: ${info.name} → ${cameraId}`);
        this.server
            .to(`campaign:${info.campaignId}`)
            .emit('camera:online', info);
        this.recordingsService.startRecording(cameraId, info).catch(() => {});
        return { success: true, cameraId };
    }

    @SubscribeMessage('camera:chunk')
    handleCameraChunk(
        client: Socket,
        data: { cameraId: string; chunk: Buffer; mimeType?: string },
    ) {
        if (data.mimeType) this.recordingsService.updateMimeType(data.cameraId, data.mimeType);
        this.recordingsService.appendChunk(data.cameraId, data.chunk);

        const buf = Buffer.isBuffer(data.chunk) ? data.chunk : Buffer.from(data.chunk as any);
        const mime = data.mimeType || 'video/webm;codecs=vp8';

        // Cache init chunk (first chunk from this camera)
        if (!this.initChunks.has(data.cameraId)) {
            this.initChunks.set(data.cameraId, { chunk: buf, mimeType: mime });
        } else {
            // Cache recent chunks for replay
            let recent = this.recentChunks.get(data.cameraId);
            if (!recent) { recent = []; this.recentChunks.set(data.cameraId, recent); }
            recent.push({ chunk: buf, mimeType: mime });
            if (recent.length > CctvGateway.MAX_RECENT_CHUNKS) recent.shift();
        }

        this.server
            .to(`camera:${data.cameraId}:viewers`)
            .emit('camera:chunk', { cameraId: data.cameraId, chunk: data.chunk, mimeType: data.mimeType });
    }

    @SubscribeMessage('camera:stop')
    handleCameraStop(client: Socket) {
        const cam = this.cameras.get(client.id);
        if (cam) {
            this.initChunks.delete(cam.cameraId);
            this.recentChunks.delete(cam.cameraId);
            this.server
                .to(`campaign:${cam.campaignId}`)
                .emit('camera:offline', { cameraId: cam.cameraId });
            this.recordingsService.finalizeRecording(cam.cameraId).catch(() => {});
        }
    }

    @SubscribeMessage('admin:join')
    handleAdminJoin(client: Socket, campaignId: string) {
        client.join(`campaign:${campaignId}`);
        const activeCameras = Array.from(this.cameras.values()).filter(
            (c) => c.campaignId === campaignId,
        );
        return { cameras: activeCameras };
    }

    @SubscribeMessage('viewer:watch')
    handleViewerWatch(client: Socket, cameraId: string) {
        client.join(`camera:${cameraId}:viewers`);

        // Send cached init chunk + recent chunks so late-joiners can start playback
        const init = this.initChunks.get(cameraId);
        if (init) {
            client.emit('camera:chunk', { cameraId, chunk: init.chunk, mimeType: init.mimeType });
            const recent = this.recentChunks.get(cameraId) || [];
            for (const r of recent) {
                client.emit('camera:chunk', { cameraId, chunk: r.chunk, mimeType: r.mimeType });
            }
        }

        return { success: true };
    }

    @SubscribeMessage('viewer:unwatch')
    handleViewerUnwatch(client: Socket, cameraId: string) {
        client.leave(`camera:${cameraId}:viewers`);
        return { success: true };
    }

    getActiveCameras(campaignId: string): LiveCameraInfo[] {
        return Array.from(this.cameras.values()).filter(
            (c) => c.campaignId === campaignId,
        );
    }
}
