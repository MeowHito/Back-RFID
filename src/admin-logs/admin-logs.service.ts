import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminLog, AdminLogDocument } from './admin-log.schema';

interface GeoInfo {
    country: string;
    regionName: string;
    city: string;
    isp: string;
}

@Injectable()
export class AdminLogsService {
    constructor(
        @InjectModel(AdminLog.name) private adminLogModel: Model<AdminLogDocument>,
    ) { }

    /**
     * Fetch geolocation info from IP address using ip-api.com (free, no key required)
     */
    async getGeoFromIp(ip: string): Promise<GeoInfo> {
        const defaultGeo: GeoInfo = {
            country: '-',
            regionName: '-',
            city: '-',
            isp: '-',
        };

        // Skip for localhost/private IPs
        if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            return { ...defaultGeo, country: 'Local', regionName: 'Local', city: 'Local', isp: 'Local Network' };
        }

        try {
            const response = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp`);
            if (response.ok) {
                const data = await response.json();
                if (data.country) {
                    return {
                        country: data.country || '-',
                        regionName: data.regionName || '-',
                        city: data.city || '-',
                        isp: data.isp || '-',
                    };
                }
            }
        } catch (error) {
            console.error('Failed to fetch geo info for IP:', ip, error);
        }

        return defaultGeo;
    }

    /**
     * Create a new admin login log entry
     */
    async createLog(data: {
        loginAccount: string;
        accountName: string;
        clientIp: string;
        userUuid: string;
        role: string;
        remark?: string;
    }): Promise<AdminLogDocument> {
        const geo = await this.getGeoFromIp(data.clientIp);

        const log = new this.adminLogModel({
            loginAccount: data.loginAccount,
            accountName: data.accountName,
            clientIp: data.clientIp || '-',
            countryRegion: geo.country,
            provinceStateCity: geo.regionName,
            city: geo.city,
            serviceProvider: geo.isp,
            startTime: new Date(),
            remark: data.remark || 'Login successful',
            userUuid: data.userUuid,
            role: data.role,
        });

        return log.save();
    }

    /**
     * Get all admin logs with pagination, sorted by most recent first
     */
    async findAll(paging?: { page: number; limit: number }): Promise<{ data: AdminLogDocument[]; total: number }> {
        const page = paging?.page || 1;
        const limit = paging?.limit || 50;
        const skip = (page - 1) * limit;

        // Only show logs for admin role users
        const filter = { role: 'admin' };

        const [data, total] = await Promise.all([
            this.adminLogModel.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).exec(),
            this.adminLogModel.countDocuments(filter).exec(),
        ]);

        return { data, total };
    }
}
