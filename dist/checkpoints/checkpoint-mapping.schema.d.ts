import { Document, Types } from 'mongoose';
export type CheckpointMappingDocument = CheckpointMapping & Document;
export declare class CheckpointMapping {
    checkpointId: Types.ObjectId;
    eventId: Types.ObjectId;
    distanceFromStart?: number;
    cutoffTime?: number;
    active?: boolean;
    orderNum?: number;
}
export declare const CheckpointMappingSchema: import("mongoose").Schema<CheckpointMapping, import("mongoose").Model<CheckpointMapping, any, any, any, (Document<unknown, any, CheckpointMapping, any, import("mongoose").DefaultSchemaOptions> & CheckpointMapping & {
    _id: Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, CheckpointMapping, any, import("mongoose").DefaultSchemaOptions> & CheckpointMapping & {
    _id: Types.ObjectId;
} & {
    __v: number;
}), any, CheckpointMapping>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    checkpointId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    eventId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    distanceFromStart?: import("mongoose").SchemaDefinitionProperty<number | undefined, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    cutoffTime?: import("mongoose").SchemaDefinitionProperty<number | undefined, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    active?: import("mongoose").SchemaDefinitionProperty<boolean | undefined, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    orderNum?: import("mongoose").SchemaDefinitionProperty<number | undefined, CheckpointMapping, Document<unknown, {}, CheckpointMapping, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<CheckpointMapping & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, CheckpointMapping>;
