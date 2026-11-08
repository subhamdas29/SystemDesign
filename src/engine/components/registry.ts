/**
 * Typed registry mapping each ComponentType to its pure behavior model.
 * Data-driven: new components plug in here without modifying the engine loop.
 */

import { ComponentType, AnyComponentConfig } from '../../types';
import { ComponentBehaviorModel } from './types';
import { clientModel } from './clientModel';
import { dnsModel } from './dnsModel';
import { routerModel } from './routerModel';
import { loadBalancerModel } from './loadBalancerModel';
import { appServerModel } from './appServerModel';
import { cacheModel } from './cacheModel';
import { databaseModel } from './databaseModel';
import { cdnModel } from './cdnModel';
import { firewallModel } from './firewallModel';
import { wafModel } from './wafModel';
import { rateLimiterModel } from './rateLimiterModel';
import { apiGatewayModel } from './apiGatewayModel';
import { messageQueueModel } from './messageQueueModel';
import { workerModel } from './workerModel';
import { databaseReplicaModel } from './databaseReplicaModel';

export const COMPONENT_MODELS: Record<ComponentType, ComponentBehaviorModel<AnyComponentConfig>> = {
  client: clientModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  dns: dnsModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  router: routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'load-balancer': loadBalancerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'app-server': appServerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  cache: cacheModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  database: databaseModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,

  // Perimeter and edge defense models (Phase 8B)
  cdn: cdnModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  firewall: firewallModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  waf: wafModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'rate-limiter': rateLimiterModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,

  // Phase 9 components
  'api-gateway': apiGatewayModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'message-queue': messageQueueModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  worker: workerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'database-replica': databaseReplicaModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
};

export function getComponentModel(type: ComponentType): ComponentBehaviorModel<AnyComponentConfig> {
  const model = COMPONENT_MODELS[type];
  if (!model) {
    throw new Error(`No behavior model registered for component type "${type}".`);
  }
  return model;
}
