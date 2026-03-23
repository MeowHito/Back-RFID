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
    private splitSyncTick = 0; // Run split sync every 3rd tick (~15s)
    private bioStatusTick = 0; // Run BIO FinishStatus check every 6th tick (~30s)

    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        private readonly syncService: SyncService,
    ) { }

    onModuleInit() {
        // Start auto-sync interval (5 seconds)
        this.intervalId = setInterval(() => {
            this.runAutoSync().catch(err => {
                this.logger.error('Auto-sync error', err?.message || err);
            });
        }, 5_000);
        this.logger.log('RaceTiger auto-sync scheduler initialized (5s score / 15s split)');
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

            this.splitSyncTick++;
            this.bioStatusTick++;
            const runSplitSync = this.splitSyncTick % 3 === 0; // every 3rd tick = ~15s
            const runBioStatusSync = this.bioStatusTick % 6 === 0; // every 6th tick = ~30s

            for (const campaign of campaigns) {
                const cid = String(campaign._id);
                try {
                    // Score sync every 5s (rank, time, status, pace)
                    const result = await this.syncService.syncTimingOnly(cid);
                    if (result.updated > 0 || result.statusChanges > 0) {
                        this.logger.log(
                            `Auto-sync [${campaign.name || cid}]: ` +
                            `${result.updated} timing updates, ${result.statusChanges} status changes`
                        );
                    }
                    // Split sync every ~15s (checkpoint passes, lap data, progress)
                    if (runSplitSync) {
                        const splitResult = await this.syncService.syncSplitOnly(cid);
                        if (splitResult.upserted > 0) {
                            this.logger.log(
                                `Auto-split-sync [${campaign.name || cid}]: ${splitResult.upserted} timing records upserted`
                            );
                        }
                    }
                    // BIO FinishStatus sync every ~30s (DNF/DNS/DQ/FIN from Athlete info)
                    if (runBioStatusSync) {
                        const bioResult = await this.syncService.syncBioFinishStatus(cid);
                        if (bioResult.updated > 0) {
                            this.logger.log(
                                `Auto-bio-status [${campaign.name || cid}]: ${bioResult.updated} status updates from Athlete info`
                            );
                        }
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
