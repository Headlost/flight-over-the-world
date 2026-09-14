import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins';

export class RotatingCesiumIonAuthPlugin extends CesiumIonAuthPlugin {
  constructor({ tokenRotation, ...options }) {
    super({ ...options, apiToken: tokenRotation.currentToken });
    const originalRefresh = this.auth.refreshToken.bind(this.auth);
    let pending = null;

    this.auth.refreshToken = options => {
      if (pending) return pending;
      pending = (async () => {
        do {
          this.apiToken = tokenRotation.currentToken;
          try { return await originalRefresh(options); }
          catch (error) {
            // 3d-tiles-renderer 0.5.2 retains a rejected refresh promise. Clear
            // it before retrying so the next credential makes a fresh request.
            this.auth._tokenRefreshPromise = null;
            if (!tokenRotation.advanceAfter(error)) throw error;
          }
        } while (true);
      })().finally(() => { pending = null; });
      return pending;
    };
  }
}
