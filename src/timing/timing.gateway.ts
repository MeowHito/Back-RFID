import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
    },
})
export class TimingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedClients = new Map<string, Set<string>>();
    // Batch buffer: collect runner updates per eventId, flush every 200ms
    private batchBuffer = new Map<string, any[]>();
    private batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        // Remove from all event rooms
        this.connectedClients.forEach((clients) => {
            clients.delete(client.id);
        });
    }

    @SubscribeMessage('joinEvent')
    handleJoinEvent(client: Socket, eventId: string) {
        client.join(`event:${eventId}`);

        if (!this.connectedClients.has(eventId)) {
            this.connectedClients.set(eventId, new Set());
        }
        this.connectedClients.get(eventId)!.add(client.id);

        console.log(`Client ${client.id} joined event: ${eventId}`);
        return { success: true, eventId };
    }

    @SubscribeMessage('leaveEvent')
    handleLeaveEvent(client: Socket, eventId: string) {
        client.leave(`event:${eventId}`);
        this.connectedClients.get(eventId)?.delete(client.id);
        console.log(`Client ${client.id} left event: ${eventId}`);
        return { success: true };
    }

    broadcastRunnerUpdate(eventId: string, runner: any) {
        if (!this.batchBuffer.has(eventId)) {
            this.batchBuffer.set(eventId, []);
        }
        this.batchBuffer.get(eventId)!.push(runner);

        if (!this.batchTimers.has(eventId)) {
            const timer = setTimeout(() => {
                const batch = this.batchBuffer.get(eventId) || [];
                this.batchBuffer.delete(eventId);
                this.batchTimers.delete(eventId);
                if (batch.length > 0) {
                    this.server.to(`event:${eventId}`).emit('runnerBatchUpdate', batch);
                }
            }, 200);
            this.batchTimers.set(eventId, timer);
        }
    }

    broadcastNewScan(eventId: string, scan: any) {
        this.server.to(`event:${eventId}`).emit('newScan', scan);
    }

    broadcastEventStatus(eventId: string, status: string) {
        this.server.to(`event:${eventId}`).emit('eventStatus', { eventId, status });
    }
}
