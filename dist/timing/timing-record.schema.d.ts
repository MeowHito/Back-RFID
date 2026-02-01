import { Document, Types } from 'mongoose';
export type TimingRecordDocument = TimingRecord & Document;
export declare class TimingRecord {
    eventId: Types.ObjectId;
    runnerId: Types.ObjectId;
    bib: string;
    checkpoint: string;
    scanTime: Date;
    rfidTag: string;
    order: number;
    note: string;
    splitTime: number;
    elapsedTime: number;
}
export declare const TimingRecordSchema: import("mongoose").Schema<TimingRecord, import("mongoose").Model<TimingRecord, any, any, any, (Document<unknown, any, TimingRecord, any, import("mongoose").DefaultSchemaOptions> & TimingRecord & {
    _id: Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, TimingRecord, any, import("mongoose").DefaultSchemaOptions> & TimingRecord & {
    _id: Types.ObjectId;
} & {
    __v: number;
}), any, TimingRecord>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TimingRecord, Document<unknown, {}, TimingRecord, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    eventId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    runnerId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bib?: import("mongoose").SchemaDefinitionProperty<string, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkpoint?: import("mongoose").SchemaDefinitionProperty<string, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    scanTime?: import("mongoose").SchemaDefinitionProperty<Date, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rfidTag?: import("mongoose").SchemaDefinitionProperty<string, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    order?: import("mongoose").SchemaDefinitionProperty<number, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    note?: import("mongoose").SchemaDefinitionProperty<string, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    splitTime?: import("mongoose").SchemaDefinitionProperty<number, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    elapsedTime?: import("mongoose").SchemaDefinitionProperty<number, TimingRecord, Document<unknown, {}, TimingRecord, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<TimingRecord & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TimingRecord>;
