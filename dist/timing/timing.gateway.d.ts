import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class TimingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private connectedClients;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinEvent(client: Socket, eventId: string): {
        success: boolean;
        eventId: string;
    };
    handleLeaveEvent(client: Socket, eventId: string): {
        success: boolean;
    };
    broadcastRunnerUpdate(eventId: string, runner: any): void;
    broadcastNewScan(eventId: string, scan: any): void;
    broadcastEventStatus(eventId: string, status: string): void;
}
