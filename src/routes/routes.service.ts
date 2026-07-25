import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RouteTrack, RouteTrackDocument } from './route-track.schema';
import { UpsertRouteDto, UpdateMarksDto } from './dto/upsert-route.dto';

/** Hard ceiling on stored points — the client downsamples well below this. */
const MAX_POINTS = 6000;

@Injectable()
export class RoutesService {
    constructor(
        @InjectModel(RouteTrack.name)
        private routeModel: Model<RouteTrackDocument>,
    ) { }

    /**
     * Keep only well-formed [lat, lng, km?, ele?] points inside real-world ranges.
     * The optional 4th slot is elevation in metres — it drives the 2D course
     * profile, and is simply absent for files (or older uploads) without one.
     */
    private sanitizeCoords(coords: unknown): number[][] {
        if (!Array.isArray(coords)) return [];
        const out: number[][] = [];
        for (const p of coords) {
            if (!Array.isArray(p) || p.length < 2) continue;
            const lat = Number(p[0]);
            const lng = Number(p[1]);
            const km = p.length > 2 ? Number(p[2]) : 0;
            const ele = p.length > 3 ? Number(p[3]) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
            const point = [lat, lng, Number.isFinite(km) ? km : 0];
            // Guard against nonsense altitudes (Dead Sea to above Everest).
            if (Number.isFinite(ele) && ele > -500 && ele < 9000) point.push(ele);
            out.push(point);
            if (out.length >= MAX_POINTS) break;
        }
        return out;
    }

    async upsert(dto: UpsertRouteDto): Promise<RouteTrack> {
        const coords = this.sanitizeCoords(dto.coords);
        if (coords.length < 2) {
            throw new BadRequestException('GPX track has fewer than 2 usable points');
        }

        const lats = coords.map(c => c[0]);
        const lngs = coords.map(c => c[1]);
        const bounds = dto.bounds ?? {
            minLat: Math.min(...lats),
            minLng: Math.min(...lngs),
            maxLat: Math.max(...lats),
            maxLng: Math.max(...lngs),
        };

        return this.routeModel.findOneAndUpdate(
            { campaignId: dto.campaignId, category: dto.category },
            {
                $set: {
                    campaignId: dto.campaignId,
                    category: dto.category,
                    fileName: dto.fileName || '',
                    coords,
                    distanceKm: dto.distanceKm ?? coords[coords.length - 1][2] ?? 0,
                    elevationGainM: dto.elevationGainM ?? 0,
                    pointCount: coords.length,
                    rawPointCount: dto.rawPointCount ?? coords.length,
                    bounds,
                    // A fresh upload replaces the line, so old km markers no longer
                    // describe it — drop them unless the caller sent new ones.
                    checkpointMarks: dto.checkpointMarks ?? [],
                },
            },
            { new: true, upsert: true },
        ).lean().exec() as unknown as RouteTrack;
    }

    async updateMarks(dto: UpdateMarksDto): Promise<RouteTrack | null> {
        return this.routeModel.findOneAndUpdate(
            { campaignId: dto.campaignId, category: dto.category },
            { $set: { checkpointMarks: dto.checkpointMarks } },
            { new: true },
        ).lean().exec() as unknown as RouteTrack | null;
    }

    /** All routes of a campaign. `meta` omits the heavy coords array. */
    async findByCampaign(campaignId: string, meta = false): Promise<RouteTrack[]> {
        const q = this.routeModel.find({ campaignId });
        if (meta) q.select('-coords');
        return q.lean().exec() as unknown as Promise<RouteTrack[]>;
    }

    async remove(campaignId: string, category: string): Promise<{ deleted: number }> {
        const res = await this.routeModel.deleteOne({ campaignId, category }).exec();
        return { deleted: res.deletedCount ?? 0 };
    }
}
