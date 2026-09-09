import type { AxiosRequestConfig } from "axios"

import { API_ENDPOINT, ApiClientInstance } from "@shared/api"
import type { Config } from "@shared/api/generated"

import { CONFIG_FIXTURE } from "./Config.mock"

/** Без задержки состояние загрузки не успевает отрисоваться. */
const FIXTURE_DELAY = 120

/**
 * Демон ручку конфига пока не отдаёт. Условие начинается с `DEV`, поэтому в
 * собранный бинарь ветка с фикстурой не попадает вовсе; против живого демона
 * фронт проверяется флагом `VITE_METABOX_MOCK_CONFIG=false`.
 */
function isMocked(): boolean {
  return (
    import.meta.env.DEV && import.meta.env.VITE_METABOX_MOCK_CONFIG !== "false"
  )
}

async function getFixture(): Promise<Config> {
  await new Promise((resolve) => setTimeout(resolve, FIXTURE_DELAY))

  return CONFIG_FIXTURE
}

export async function getConfig(config?: AxiosRequestConfig): Promise<Config> {
  if (isMocked()) {
    return getFixture()
  }

  return ApiClientInstance.get<Config>(API_ENDPOINT.config(), config)
}
