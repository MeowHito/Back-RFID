import { Document, Types } from 'mongoose';
export type RunnerDocument = Runner & Document;
export declare class Runner {
    eventId: Types.ObjectId;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh: string;
    lastNameTh: string;
    gender: string;
    ageGroup: string;
    age: number;
    box: string;
    team: string;
    category: string;
    status: string;
    rfidTag: string;
    checkInTime: Date;
    startTime: Date;
    finishTime: Date;
    netTime: number;
    elapsedTime: number;
    overallRank: number;
    genderRank: number;
    ageGroupRank: number;
    latestCheckpoint: string;
    chipCode: string;
    nationality: string;
    birthDate: Date;
    idNo: string;
    shirtSize: string;
    teamName: string;
    registerDate: Date;
    isStarted: boolean;
    allowRFIDSync: boolean;
    email: string;
    phone: string;
    emergencyContact: string;
    emergencyPhone: string;
    medicalInfo: string;
    bloodType: string;
    chronicDiseases: string;
    address: string;
    categoryRank: number;
}
export declare const RunnerSchema: import("mongoose").Schema<Runner, import("mongoose").Model<Runner, any, any, any, (Document<unknown, any, Runner, any, import("mongoose").DefaultSchemaOptions> & Runner & {
    _id: Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Runner, any, import("mongoose").DefaultSchemaOptions> & Runner & {
    _id: Types.ObjectId;
} & {
    __v: number;
}), any, Runner>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Runner, Document<unknown, {}, Runner, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    eventId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bib?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    firstName?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastName?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    firstNameTh?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastNameTh?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    gender?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    ageGroup?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    age?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    box?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    team?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    category?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rfidTag?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkInTime?: import("mongoose").SchemaDefinitionProperty<Date, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    startTime?: import("mongoose").SchemaDefinitionProperty<Date, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    finishTime?: import("mongoose").SchemaDefinitionProperty<Date, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    netTime?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    elapsedTime?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    overallRank?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    genderRank?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    ageGroupRank?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    latestCheckpoint?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chipCode?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    nationality?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    birthDate?: import("mongoose").SchemaDefinitionProperty<Date, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    idNo?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    shirtSize?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    teamName?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    registerDate?: import("mongoose").SchemaDefinitionProperty<Date, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isStarted?: import("mongoose").SchemaDefinitionProperty<boolean, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    allowRFIDSync?: import("mongoose").SchemaDefinitionProperty<boolean, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    email?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    phone?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    emergencyContact?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    emergencyPhone?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    medicalInfo?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bloodType?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    chronicDiseases?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    address?: import("mongoose").SchemaDefinitionProperty<string, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    categoryRank?: import("mongoose").SchemaDefinitionProperty<number, Runner, Document<unknown, {}, Runner, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Runner & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Runner>;
