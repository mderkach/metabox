import type { AxiosRequestConfig } from "axios"

import { API_ENDPOINT, ApiClientInstance } from "@shared/api"
import type { Config } from "@shared/api/generated"

export async function getConfig(config?: AxiosRequestConfig): Promise<Config> {
  return ApiClientInstance.get<Config>(API_ENDPOINT.config(), config)
}
