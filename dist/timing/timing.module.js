"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const timing_controller_1 = require("./timing.controller");
const timing_service_1 = require("./timing.service");
const timing_gateway_1 = require("./timing.gateway");
const timing_record_schema_1 = require("./timing-record.schema");
const runners_module_1 = require("../runners/runners.module");
let TimingModule = class TimingModule {
};
exports.TimingModule = TimingModule;
exports.TimingModule = TimingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: timing_record_schema_1.TimingRecord.name, schema: timing_record_schema_1.TimingRecordSchema }]),
            runners_module_1.RunnersModule,
        ],
        controllers: [timing_controller_1.TimingController],
        providers: [timing_service_1.TimingService, timing_gateway_1.TimingGateway],
        exports: [timing_service_1.TimingService, timing_gateway_1.TimingGateway],
    })
], TimingModule);
//# sourceMappingURL=timing.module.js.map