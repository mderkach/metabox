import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { ConfigTextLink } from '@widgets/Config/ConfigTabs';

/** Actions on the whole config file: its text and its version history. */
export function ConfigLayoutActions() {
  return (
    <div className='flex items-center gap-2'>
      <ConfigTextLink />
      <ConfigApplyHistory />
    </div>
  );
}
