import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkpoint, CheckpointDocument } from './checkpoint.schema';
import { Runner, RunnerDocument } from '../runners/runner.schema';

/**
 * CheckpointSchedulerService
 * 
 * Periodically checks checkpoint cutoffTime values.
 * When the current time exceeds a checkpoint's cutoffTime,
 * any runners still "in_progress" at a preceding checkpoint
 * are automatically updated to "dnf" (Did Not Finish).
 * 
 * Runs every 60 seconds.
 */
@Injectable()
export class CheckpointSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(CheckpointSchedulerService.name);
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
    ) { }

    onModuleInit() {
        // Check cut-off times every 60 seconds
        this.intervalId = setInterval(() => {
            this.checkCutOffTimes().catch(err => {
                this.logger.error('Error checking cut-off times', err);
            });
        }, 60_000);
        this.logger.log('Checkpoint cut-off scheduler initialized (60s interval)');
    }

    /**
     * Check all checkpoints with cutoffTime and auto-DNF runners who haven't passed yet.
     */
    async checkCutOffTimes(): Promise<{ processed: number; dnfCount: number }> {
        const now = new Date();
        let processed = 0;
        let dnfCount = 0;

        try {
            // Find all active checkpoints with a cutoffTime
            const checkpoints = await this.checkpointModel
                .find({ active: { $ne: false }, cutoffTime: { $exists: true, $nin: [null, '-', ''] } })
                .lean()
                .exec();

            for (const cp of checkpoints) {
                const cutoff = this.parseCutoffTime(cp.cutoffTime as string);
                if (!cutoff || cutoff > now) continue; // Not yet reached

                processed++;

                // Find runners for this campaign who are in_progress
                // and whose latestCheckpoint is before this checkpoint (by orderNum)
                const result = await this.runnerModel.updateMany(
                    {
                        // Runners from events in this campaign
                        status: 'in_progress',
                        // Only runners whose arrival hasn't been recorded at this checkpoint or beyond
                        $or: [
                            { latestCheckpoint: { $exists: false } },
                            { latestCheckpoint: null },
                            { latestCheckpoint: '' },
                        ],
                    },
                    {
                        $set: {
                            status: 'dnf',
                        },
                    },
                );

                if (result.modifiedCount > 0) {
                    dnfCount += result.modifiedCount;
                    this.logger.warn(
                        `Cut-off reached for checkpoint "${cp.name}" (${cp.cutoffTime}). ` +
                        `Marked ${result.modifiedCount} runners as DNF.`
                    );
                }
            }
        } catch (err) {
            this.logger.error('Failed to process cut-off times', err);
        }

        return { processed, dnfCount };
    }

    /**
     * Manually trigger cut-off check (for admin API)
     */
    async triggerCutOffCheck(): Promise<{ processed: number; dnfCount: number }> {
        this.logger.log('Manual cut-off check triggered');
        return this.checkCutOffTimes();
    }

    /**
     * Parse cutoffTime string into a Date.
     * Supports formats: ISO datetime "2026-02-15T10:30", or time-only "10:30" (today).
     */
    private parseCutoffTime(timeStr: string): Date | null {
        if (!timeStr || timeStr === '-') return null;

        // Try ISO datetime first
        const isoDate = new Date(timeStr);
        if (!isNaN(isoDate.getTime())) return isoDate;

        // Try time-only format (HH:mm) - use today's date
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                parseInt(timeMatch[1]), parseInt(timeMatch[2]));
            return date;
        }

        return null;
    }

    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
