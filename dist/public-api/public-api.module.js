"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicApiModule = void 0;
const common_1 = require("@nestjs/common");
const public_api_controller_1 = require("./public-api.controller");
const users_module_1 = require("../users/users.module");
const auth_module_1 = require("../auth/auth.module");
const campaigns_module_1 = require("../campaigns/campaigns.module");
const runners_module_1 = require("../runners/runners.module");
const checkpoints_module_1 = require("../checkpoints/checkpoints.module");
const timing_module_1 = require("../timing/timing.module");
let PublicApiModule = class PublicApiModule {
};
exports.PublicApiModule = PublicApiModule;
exports.PublicApiModule = PublicApiModule = __decorate([
    (0, common_1.Module)({
        imports: [
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            campaigns_module_1.CampaignsModule,
            runners_module_1.RunnersModule,
            checkpoints_module_1.CheckpointsModule,
            timing_module_1.TimingModule,
        ],
        controllers: [public_api_controller_1.PublicApiController],
    })
], PublicApiModule);
//# sourceMappingURL=public-api.module.js.map