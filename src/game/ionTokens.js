export function ionTokenList(primary = '', fallbacks = '') {
  return [...new Set([primary, fallbacks].flatMap(value => value.split(',')).map(token => token.trim()).filter(Boolean))];
}

export class IonTokenRotation {
  constructor(tokens) {
    this.tokens = [...tokens];
    this.index = 0;
  }

  get currentToken() { return this.tokens[this.index] || ''; }

  advanceAfter(error) {
    // Only a rejected ion credential triggers rotation. Permissions, quotas,
    // rate limits, missing assets and network errors keep the current account.
    const invalidCredential = error?.message === 'CesiumIonAuthPlugin: Failed to load data with error code 401';
    if (!invalidCredential || this.index + 1 >= this.tokens.length) return false;
    this.index += 1;
    return true;
  }
}
