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

export const COMPONENT_MODELS: Record<ComponentType, ComponentBehaviorModel<AnyComponentConfig>> = {
  client: clientModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  dns: dnsModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  router: routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'load-balancer': loadBalancerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'app-server': appServerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  cache: cacheModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  database: databaseModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,

  // Default passthrough stubs for auxiliary components
  cdn: cacheModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  firewall: routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  waf: routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'rate-limiter': routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'api-gateway': loadBalancerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
  'message-queue': routerModel as unknown as ComponentBehaviorModel<AnyComponentConfig>,
};

export function getComponentModel(type: ComponentType): ComponentBehaviorModel<AnyComponentConfig> {
  const model = COMPONENT_MODELS[type];
  if (!model) {
    throw new Error(`No behavior model registered for component type "${type}".`);
  }
  return model;
}
