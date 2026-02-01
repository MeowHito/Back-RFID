import { Document, Types } from 'mongoose';
export type SyncLogDocument = SyncLog & Document;
export declare class SyncLog {
    campaignId: Types.ObjectId;
    status: string;
    message: string;
    recordsProcessed: number;
    recordsFailed: number;
    startTime: Date;
    endTime: Date;
    errorDetails: Record<string, any>;
}
export declare const SyncLogSchema: import("mongoose").Schema<SyncLog, import("mongoose").Model<SyncLog, any, any, any, (Document<unknown, any, SyncLog, any, import("mongoose").DefaultSchemaOptions> & SyncLog & {
    _id: Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, SyncLog, any, import("mongoose").DefaultSchemaOptions> & SyncLog & {
    _id: Types.ObjectId;
} & {
    __v: number;
}), any, SyncLog>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, SyncLog, Document<unknown, {}, SyncLog, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    campaignId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    message?: import("mongoose").SchemaDefinitionProperty<string, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    recordsProcessed?: import("mongoose").SchemaDefinitionProperty<number, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    recordsFailed?: import("mongoose").SchemaDefinitionProperty<number, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    startTime?: import("mongoose").SchemaDefinitionProperty<Date, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    endTime?: import("mongoose").SchemaDefinitionProperty<Date, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    errorDetails?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, SyncLog, Document<unknown, {}, SyncLog, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SyncLog & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, SyncLog>;
