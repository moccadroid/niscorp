import type { LayoutNode } from '@niscorp/nova';

export const studioBusinessLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24 },
  children: [
    {
      component: 'Hero',
      props: {
        eyebrow: '$.studioName',
        title: 'Business',
        lead: 'Who this studio is on paper. A payment provider asks for these before it will take money, and they appear on what your members are sent.',
      },
    },
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    {
      component: 'Card',
      props: { pad: 18 },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            component: 'Select',
            props: {
              label: 'What kind of business this is',
              hint: 'Decides what a payment provider asks you for. Hard to change once an account exists, so it is worth getting right now.',
              value: '$.studioRow.legal_form',
              options: [
                { value: 'company', label: 'A company' },
                { value: 'individual', label: 'A sole trader' },
              ],
            },
            ref: 'legalForm',
          },
          { component: 'Input', props: { label: 'Registered name', hint: 'As it appears on the register — not the name above the door, if they differ.' }, ref: 'legalName', model: '$.legalName' },
          { component: 'Input', props: { label: 'Address', hint: 'Where the business trades from.' }, ref: 'address', model: '$.address' },
          { component: 'Input', props: { label: 'VAT number', hint: 'UID, USt-IdNr, VAT number — whatever it is called where you are. Leave it empty if the business is not registered for VAT.' }, ref: 'vatId', model: '$.vatId' },
          {
            component: 'Row',
            props: { gap: 10 },
            children: [{ component: 'Button', props: { variant: 'outline', label: 'Save business details' }, ref: 'saveBusiness' }],
          },
          { if: '$.legalSaved', then: { component: 'Notice', props: { tone: 'good', message: 'Saved.' } }, else: '' },
        ],
      },
    },
  ],
};
