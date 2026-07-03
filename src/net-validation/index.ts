/**
 * Net validation — public API barrel.
 *
 * @module
 */

export { NetValidationCode, netValidationIssue, netError, netWarning } from './errors.js';
export type {
  NetValidationCode as NetValidationCodeType,
  NetValidationIssue,
  NetValidationResult,
} from './errors.js';

export {
  NetDomain,
  NET_DOMAIN_PATTERNS,
  NET_TYPE_EXPECTED_DOMAIN,
  RESERVED_NET_NAMES,
  REQUIRED_POWER_NETS,
  REQUIRED_GROUND_NETS,
} from './schema.js';
export type {
  NetValidationEntry,
  NetValidationNode,
  DeviceValidationEntry,
  InterfaceValidationEntry,
  NetValidationInput,
  PinElectricalType,
  PinValidationMetadata,
} from './schema.js';

export { validateNets, validateNetsOrThrow } from './validation.js';
