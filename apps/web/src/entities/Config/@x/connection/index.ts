// What the Config slice allows the Connection slice to import: the outbound
// type is known only to the document, while what it means for a connection row
// is Connection knowledge, and the translation table lives there.
export { useOutboundTypes } from '../../api';
