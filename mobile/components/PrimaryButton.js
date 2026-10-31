import { Button, Footer } from './Controls';

// Footer bar + 56 ink pill: the one primary action on a screen. Disabled = off fill and text;
// pressed = the darker ink; loading shows a spinner in place of the label. `error` (a string or an
// Error) shows above the button in the footer, so a failed action is visible next to it.
export default function PrimaryButton({ label, onPress, disabled, loading, error }) {
  return (
    <Footer error={error}>
      <Button label={label} onPress={onPress} disabled={disabled} loading={loading} />
    </Footer>
  );
}
