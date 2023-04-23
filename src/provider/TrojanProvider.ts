import assert from 'assert'
import { z } from 'zod'

import {
  SubscriptionUserinfo,
  TrojanNodeConfig,
  TrojanProviderConfig,
} from '../types'
import { fromBase64 } from '../utils'
import relayableUrl from '../utils/relayable-url'
import { parseTrojanUri } from '../utils/trojan'
import Provider from './Provider'

export default class TrojanProvider extends Provider {
  readonly #originalUrl: string
  public readonly udpRelay?: boolean
  public readonly tls13?: boolean

  constructor(name: string, config: TrojanProviderConfig) {
    super(name, config)

    const schema = z.object({
      url: z.string().url(),
      udpRelay: z.boolean().optional(),
      tls13: z.boolean().optional(),
    })
    const result = schema.safeParse(config)

    // istanbul ignore next
    if (!result.success) {
      throw result.error
    }

    this.#originalUrl = result.data.url
    this.udpRelay = result.data.udpRelay
    this.tls13 = result.data.tls13
    this.supportGetSubscriptionUserInfo = true
  }

  // istanbul ignore next
  public get url(): string {
    return relayableUrl(this.#originalUrl, this.config.relayUrl)
  }

  public async getSubscriptionUserInfo({
    requestUserAgent,
  }: { requestUserAgent?: string } = {}): Promise<
    SubscriptionUserinfo | undefined
  > {
    const { subscriptionUserinfo } = await getTrojanSubscription({
      url: this.url,
      udpRelay: this.udpRelay,
      tls13: this.tls13,
      requestUserAgent: requestUserAgent || this.config.requestUserAgent,
    })

    if (subscriptionUserinfo) {
      return subscriptionUserinfo
    }
    return void 0
  }

  public async getNodeList({
    requestUserAgent,
  }: { requestUserAgent?: string } = {}): Promise<
    ReadonlyArray<TrojanNodeConfig>
  > {
    const { nodeList } = await getTrojanSubscription({
      url: this.url,
      udpRelay: this.udpRelay,
      tls13: this.tls13,
      requestUserAgent: requestUserAgent || this.config.requestUserAgent,
    })

    return nodeList
  }
}

/**
 * @see https://github.com/trojan-gfw/trojan-url/blob/master/trojan-url.py
 */
export const getTrojanSubscription = async ({
  url,
  udpRelay,
  tls13,
  requestUserAgent,
}: {
  url: string
  udpRelay?: boolean
  tls13?: boolean
  requestUserAgent?: string
}): Promise<{
  readonly nodeList: ReadonlyArray<TrojanNodeConfig>
  readonly subscriptionUserinfo?: SubscriptionUserinfo
}> => {
  assert(url, '未指定订阅地址 url')

  const response = await Provider.requestCacheableResource(url, {
    requestUserAgent: requestUserAgent || 'shadowrocket',
  })
  const config = fromBase64(response.body)
  const nodeList = config
    .split('\n')
    .filter((item) => !!item && item.startsWith('trojan://'))
    .map((item): TrojanNodeConfig => {
      const nodeConfig = parseTrojanUri(item)

      return {
        ...nodeConfig,
        udpRelay,
        tls13,
      }
    })

  return {
    nodeList,
    subscriptionUserinfo: response.subscriptionUserinfo,
  }
}
