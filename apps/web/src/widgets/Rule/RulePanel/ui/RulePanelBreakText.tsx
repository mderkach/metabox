import { Fragment } from 'react';
const BREAK_POINT = /(?=\.)|(?<=_)/;

export function RulePanelBreakText({ text }: { text: string }) {
  return text.split(BREAK_POINT).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}
