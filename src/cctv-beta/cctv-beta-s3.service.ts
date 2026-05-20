import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    type ObjectIdentifier,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';

/**
 * Direct S3 operations for the CCTV Beta pipeline.
 *
 * The Beta storage flow is:
 *   MediaMTX (EC2 disk) → s3-sync container → S3 bucket
 *
 * Deleting a recording in /admin/cctv-beta-recordings used to only remove the
 * MongoDB metadata; the actual HLS segments + manifest in S3 stayed forever.
 * This service plugs the gap by calling DeleteObjects on the recording's prefix
 * (`hls/{streamKey}/`) when an admin removes a recording.
 *
 * All methods are best-effort: if AWS credentials or the bucket aren't configured,
 * they no-op rather than throwing — so a half-configured dev environment can still
 * delete DB rows without S3 errors.
 *
 * Required env vars (backend `.env`):
 *   AWS_REGION             e.g. ap-southeast-1
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   CCTV_BETA_S3_BUCKET    e.g. cctv-rfid       (falls back to S3_BUCKET)
 *
 * Required IAM permissions on the bucket:
 *   s3:ListBucket          — to enumerate objects under the prefix
 *   s3:DeleteObject        — to remove each object
 */
@Injectable()
export class CctvBetaS3Service {
    private readonly logger = new Logger(CctvBetaS3Service.name);
    private client: S3Client | null = null;
    private readonly bucketName: string | null;

    constructor(private readonly config: ConfigService) {
        const region =
            config.get<string>('AWS_REGION') ||
            config.get<string>('AWS_DEFAULT_REGION');
        const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
        this.bucketName =
            config.get<string>('CCTV_BETA_S3_BUCKET') ||
            config.get<string>('S3_BUCKET') ||
            null;

        if (region && this.bucketName) {
            // If static keys are present use them; otherwise fall back to the default
            // AWS credential provider chain (env → shared config → EC2 IAM instance
            // role via IMDS → ECS task role). This lets the same code work on a dev
            // laptop with explicit keys AND on EC2 with an attached IAM role.
            const usingStaticKeys = !!(accessKeyId && secretAccessKey);
            this.client = new S3Client(
                usingStaticKeys
                    ? { region, credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
                    : { region },
            );
            this.logger.log(
                `S3 delete enabled: bucket=${this.bucketName} region=${region} ` +
                `creds=${usingStaticKeys ? 'static-env' : 'default-chain (IAM role / IMDS)'}`,
            );
        } else {
            this.logger.warn(
                'CCTV Beta S3 delete DISABLED — missing AWS_REGION/AWS_DEFAULT_REGION or ' +
                'CCTV_BETA_S3_BUCKET/S3_BUCKET. Recordings deleted from the admin UI will only ' +
                'remove DB rows; S3 objects will stay (configure a Lifecycle rule as backup).',
            );
        }
    }

    /** True when AWS credentials + bucket are configured. */
    isEnabled(): boolean {
        return !!this.client && !!this.bucketName;
    }

    /** The configured bucket — null when S3 isn't enabled. */
    getBucket(): string | null {
        return this.bucketName;
    }

    /**
     * Upload a local file to S3 at `key`. Returns the resulting bucket+key+https URL,
     * or `null` when S3 isn't configured (caller should keep using the local file in that
     * case). Errors propagate to the caller — they're best handled with try/catch so a
     * single S3 outage doesn't take the recording offline.
     */
    async uploadFile(
        localPath: string,
        key: string,
        contentType: string,
    ): Promise<{ bucket: string; key: string; url: string } | null> {
        if (!this.client || !this.bucketName) return null;
        const stat = fs.statSync(localPath);
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: fs.createReadStream(localPath),
                ContentType: contentType,
                ContentLength: stat.size,
            }),
        );
        return {
            bucket: this.bucketName,
            key,
            url: `https://${this.bucketName}.s3.amazonaws.com/${key}`,
        };
    }

    /** Delete a single object by key. No-op when S3 isn't configured. */
    async deleteKey(key: string): Promise<void> {
        if (!this.client || !this.bucketName || !key) return;
        await this.client.send(
            new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
        );
    }

    /**
     * Delete every object under `prefix` (e.g. `hls/{streamKey}/`).
     * Uses ListObjectsV2 + DeleteObjects in pages of 1000 (S3 API limit).
     * Returns the number of objects actually deleted.
     */
    async deletePrefix(prefix: string): Promise<{ deleted: number }> {
        if (!this.client || !this.bucketName || !prefix) return { deleted: 0 };

        let deleted = 0;
        let ContinuationToken: string | undefined;
        let pages = 0;

        do {
            const list = await this.client.send(
                new ListObjectsV2Command({
                    Bucket: this.bucketName,
                    Prefix: prefix,
                    ContinuationToken,
                }),
            );
            const objects: ObjectIdentifier[] = (list.Contents || [])
                .filter((o) => !!o.Key)
                .map((o) => ({ Key: o.Key! }));

            if (objects.length > 0) {
                await this.client.send(
                    new DeleteObjectsCommand({
                        Bucket: this.bucketName,
                        Delete: { Objects: objects, Quiet: true },
                    }),
                );
                deleted += objects.length;
            }

            ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
            pages++;
            // Safety stop — should never iterate this many in practice
            if (pages > 100) {
                this.logger.warn(`deletePrefix(${prefix}) stopped after 100 pages`);
                break;
            }
        } while (ContinuationToken);

        return { deleted };
    }
}
