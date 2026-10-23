import { Button, Footer } from './Controls';

// Footer bar + 56 ink pill: the one primary action on a screen. Disabled = off fill and text;
// pressed = the darker ink; loading shows a spinner in place of the label.
export default function PrimaryButton({ label, onPress, disabled, loading }) {
  return (
    <Footer>
      <Button label={label} onPress={onPress} disabled={disabled} loading={loading} />
    </Footer>
  );
}
