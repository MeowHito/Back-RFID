"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let TimingGateway = class TimingGateway {
    server;
    connectedClients = new Map();
    handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        console.log(`Client disconnected: ${client.id}`);
        this.connectedClients.forEach((clients) => {
            clients.delete(client.id);
        });
    }
    handleJoinEvent(client, eventId) {
        client.join(`event:${eventId}`);
        if (!this.connectedClients.has(eventId)) {
            this.connectedClients.set(eventId, new Set());
        }
        this.connectedClients.get(eventId).add(client.id);
        console.log(`Client ${client.id} joined event: ${eventId}`);
        return { success: true, eventId };
    }
    handleLeaveEvent(client, eventId) {
        client.leave(`event:${eventId}`);
        this.connectedClients.get(eventId)?.delete(client.id);
        console.log(`Client ${client.id} left event: ${eventId}`);
        return { success: true };
    }
    broadcastRunnerUpdate(eventId, runner) {
        this.server.to(`event:${eventId}`).emit('runnerUpdate', runner);
    }
    broadcastNewScan(eventId, scan) {
        this.server.to(`event:${eventId}`).emit('newScan', scan);
    }
    broadcastEventStatus(eventId, status) {
        this.server.to(`event:${eventId}`).emit('eventStatus', { eventId, status });
    }
};
exports.TimingGateway = TimingGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], TimingGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinEvent'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], TimingGateway.prototype, "handleJoinEvent", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveEvent'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], TimingGateway.prototype, "handleLeaveEvent", null);
exports.TimingGateway = TimingGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    })
], TimingGateway);
//# sourceMappingURL=timing.gateway.js.map