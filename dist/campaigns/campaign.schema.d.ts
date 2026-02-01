import { Document } from 'mongoose';
export type CampaignDocument = Campaign & Document;
export declare class Campaign {
    uuid: string;
    name: string;
    shortName: string;
    description: string;
    eventDate: Date;
    location: string;
    logoUrl: string;
    pictureUrl: string;
    bgUrl: string;
    website: string;
    facebook: string;
    email: string;
    contactName: string;
    contactTel: string;
    status: string;
    isDraft: boolean;
    isApproveCertificate: boolean;
    allowRFIDSync: boolean;
    rfidToken: string;
    organizerName: string;
    organizerUuid: string;
    chipBgUrl: string;
    chipBanner: string;
    chipPrimaryColor: string;
    chipSecondaryColor: string;
    chipModeColor: string;
    certTextColor: string;
}
export declare const CampaignSchema: import("mongoose").Schema<Campaign, import("mongoose").Model<Campaign, any, any, any, (Document<unknown, any, Campaign, any, import("mongoose").DefaultSchemaOptions> & Campaign & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Campaign, any, import("mongoose").DefaultSchemaOptions> & Campaign & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, Campaign>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Campaign, Document<unknown, {}, Campaign, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    uuid?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    name?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    shortName?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    eventDate?: import("mongoose").SchemaDefinitionProperty<Date, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    location?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    logoUrl?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pictureUrl?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bgUrl?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    website?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    facebook?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    email?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    contactName?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    contactTel?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isDraft?: import("mongoose").SchemaDefinitionProperty<boolean, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isApproveCertificate?: import("mongoose").SchemaDefinitionProperty<boolean, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    allowRFIDSync?: import("mongoose").SchemaDefinitionProperty<boolean, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rfidToken?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    organizerName?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    organizerUuid?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipBgUrl?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipBanner?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipPrimaryColor?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipSecondaryColor?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipModeColor?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    certTextColor?: import("mongoose").SchemaDefinitionProperty<string, Campaign, Document<unknown, {}, Campaign, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Campaign & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Campaign>;
