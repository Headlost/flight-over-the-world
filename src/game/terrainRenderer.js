import { FAILED, TilesRenderer, UNLOADED } from '3d-tiles-renderer';

export class TerrainRenderer extends TilesRenderer {
  resetFailedTiles() {
    let needsUpdate = false;
    if (this.rootLoadingState === FAILED) {
      this.rootLoadingState = UNLOADED;
      needsUpdate = true;
    }

    if (this.stats.failed > 0) {
      // 3d-tiles-renderer 0.5.2 visits children before their asynchronous
      // preprocessing has added internal state. Do not force preprocessing of
      // the entire hierarchy just to retry failed downloads.
      this.traverse(tile => {
        if (!tile.internal) return true;
        if (tile.internal.loadingState === FAILED) {
          tile.internal.loadingState = UNLOADED;
          needsUpdate = true;
        }
        return false;
      }, null, false);
      this.stats.failed = 0;
    }

    // Also retry when the departure and camera have stayed in the same place.
    if (needsUpdate) this.dispatchEvent({ type: 'needs-update' });
  }
}
