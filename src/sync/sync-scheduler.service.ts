import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument } from '../campaigns/campaign.schema';
import { SyncService } from './sync.service';

/**
 * SyncSchedulerService
 *
 * Periodically syncs runner timing data from RaceTiger for campaigns
 * that have autoSync enabled. Runs every 15 seconds.
 *
 * Uses lightweight syncTimingOnly (not full bio sync) to minimize
 * API calls and prevent overloading RaceTiger.
 *
 * Only one sync runs at a time — if a sync is still in progress,
 * the next interval is skipped.
 */
@Injectable()
export class SyncSchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SyncSchedulerService.name);
    private intervalId: NodeJS.Timeout | null = null;
    private isSyncing = false;
    private syncCount = 0;

    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        private readonly syncService: SyncService,
    ) { }

    onModuleInit() {
        // Start auto-sync interval (15 seconds)
        this.intervalId = setInterval(() => {
            this.runAutoSync().catch(err => {
                this.logger.error('Auto-sync error', err?.message || err);
            });
        }, 15_000);
        this.logger.log('RaceTiger auto-sync scheduler initialized (15s interval)');
    }

    /**
     * Run auto-sync for all campaigns that have autoSync enabled.
     * Skips if a previous sync is still running.
     */
    async runAutoSync(): Promise<void> {
        if (this.isSyncing) {
            return; // silently skip — no need to log every 15s
        }

        this.isSyncing = true;
        try {
            // Find campaigns with autoSync=true and valid RaceTiger credentials
            const campaigns = await this.campaignModel
                .find({
                    autoSync: true,
                    allowRFIDSync: true,
                    raceId: { $exists: true, $nin: [null, '', '0'] },
                    rfidToken: { $exists: true, $nin: [null, ''] },
                })
                .select('_id name raceId')
                .lean()
                .exec();

            if (campaigns.length === 0) return;

            for (const campaign of campaigns) {
                const cid = String(campaign._id);
                try {
                    const result = await this.syncService.syncTimingOnly(cid);
                    // Only log when there are actual changes (to reduce noise)
                    if (result.updated > 0 || result.statusChanges > 0) {
                        this.logger.log(
                            `Auto-sync [${campaign.name || cid}]: ` +
                            `${result.updated} timing updates, ${result.statusChanges} status changes`
                        );
                    }
                    this.syncCount++;
                } catch (err: any) {
                    this.logger.error(`Auto-sync failed for campaign ${cid}: ${err?.message}`);
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Manually enable/disable auto-sync for a specific campaign.
     */
    async setAutoSync(campaignId: string, enabled: boolean): Promise<any> {
        const result = await this.campaignModel.findByIdAndUpdate(
            campaignId,
            { $set: { autoSync: enabled } },
            { new: true },
        );
        this.logger.log(`Auto-sync ${enabled ? 'ENABLED' : 'DISABLED'} for campaign ${campaignId}`);
        return result;
    }

    /** Get current sync statistics */
    getStats() {
        return { isSyncing: this.isSyncing, totalSyncs: this.syncCount };
    }

    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.logger.log('Auto-sync scheduler stopped');
        }
    }
}
