export * from './api';
export * from './model';

// Фикстуры и моки уходят наружу тем же Public API: обход барреля ловит линтер.
export * from './__tests__/Proxy.handlers';
export * from './__tests__/Proxy.fixture';
