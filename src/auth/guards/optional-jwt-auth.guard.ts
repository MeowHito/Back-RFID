import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT guard that never blocks the request. When a valid Bearer token is present,
 * `req.user` is populated with the JWT payload; when it's missing or invalid, the
 * request still proceeds with `req.user` undefined. Use for endpoints that behave
 * differently for a known user but must stay reachable anonymously (e.g. the
 * per-user "featured" campaign, which falls back to the global one when anonymous).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    handleRequest(_err: any, user: any) {
        return user || undefined;
    }
}
