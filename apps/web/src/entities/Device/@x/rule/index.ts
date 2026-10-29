// What the Device slice allows the Rule slice to import: a rule without a name
// is labelled by the device in its source condition, and the label comes from
// the one function that turns an address into a device name.
export { useDeviceIndex } from '../../api/Device.query';
export { deviceLabel } from '../../model/Device.model';
