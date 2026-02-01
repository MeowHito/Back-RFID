import { Document, Types } from 'mongoose';
export type CheckpointDocument = Checkpoint & Document;
export declare class Checkpoint {
    uuid: string;
    campaignId: Types.ObjectId;
    name: string;
    type: string;
    orderNum: number;
    active?: boolean;
    description?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
}
export declare const CheckpointSchema: import("mongoose").Schema<Checkpoint, import("mongoose").Model<Checkpoint, any, any, any, (Document<unknown, any, Checkpoint, any, import("mongoose").DefaultSchemaOptions> & Checkpoint & {
    _id: Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Checkpoint, any, import("mongoose").DefaultSchemaOptions> & Checkpoint & {
    _id: Types.ObjectId;
} & {
    __v: number;
}), any, Checkpoint>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Checkpoint, Document<unknown, {}, Checkpoint, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    uuid?: import("mongoose").SchemaDefinitionProperty<string, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    campaignId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    name?: import("mongoose").SchemaDefinitionProperty<string, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<string, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    orderNum?: import("mongoose").SchemaDefinitionProperty<number, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    active?: import("mongoose").SchemaDefinitionProperty<boolean | undefined, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string | undefined, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    location?: import("mongoose").SchemaDefinitionProperty<string | undefined, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    latitude?: import("mongoose").SchemaDefinitionProperty<number | undefined, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    longitude?: import("mongoose").SchemaDefinitionProperty<number | undefined, Checkpoint, Document<unknown, {}, Checkpoint, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Checkpoint & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Checkpoint>;
