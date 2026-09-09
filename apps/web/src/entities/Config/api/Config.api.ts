import type { AxiosRequestConfig } from "axios"

import { API_ENDPOINT, ApiClientInstance } from "@shared/api"
import type { Config } from "@shared/api/generated"

import { CONFIG_FIXTURE } from "./Config.mock"

/** Задержка фикстуры: без неё скелетон не успевает отрисоваться и его не видно. */
const FIXTURE_DELAY = 120

function isMocked(): boolean {
  return import.meta.env.VITE_METABOX_MOCK_CONFIG === "true"
}

async function getFixture(): Promise<Config> {
  await new Promise((resolve) => setTimeout(resolve, FIXTURE_DELAY))

  return CONFIG_FIXTURE
}

/**
 * Применённый конфиг устройства. Возвращает то, что прислал демон, без
 * преобразований: разбор схемой делает `select` запроса (Query.md).
 */
export async function getConfig(config?: AxiosRequestConfig): Promise<Config> {
  if (isMocked()) {
    return getFixture()
  }

  return ApiClientInstance.get<Config>(API_ENDPOINT.config(), config)
}
