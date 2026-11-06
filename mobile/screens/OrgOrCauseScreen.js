import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { colors } from '../theme/colors';
import { radii, type } from '../theme/tokens';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { Chip, ErrorLine, Headline, Icon, Input, KeyboardScroll, LinkButton, ListRow, Loading, Tag } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';
import { api } from '../api/client';

const SEARCH_DEBOUNCE_MS = 300;

function toAnswer(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

// The org-or-cause choice. "I know an org" searches the verified org directory
// (GET /orgs?q=) and saves the pick with POST /users/me/preferred-org. An org that is not listed
// is captured as a lead (prospective_org_name) plus a yes/no on being paired with the nearest
// matching organization in the meantime. Either way the causes step follows.
export default function OrgOrCauseScreen({ sessionToken, step, total, onKnowsOrg, onBrowseByCause, initialValues, title, onBack }) {
  const hasLead = Boolean(initialValues?.prospective_org_name);
  const [showOrgSearch, setShowOrgSearch] = useState(hasLead || Boolean(initialValues?.preferred_org_id));
  const [query, setQuery] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [selectedId, setSelectedId] = useState(initialValues?.preferred_org_id ?? null);
  const [selectedName, setSelectedName] = useState(null);
  const [showLead, setShowLead] = useState(hasLead);
  const [leadName, setLeadName] = useState(initialValues?.prospective_org_name ?? '');
  const [okNearest, setOkNearest] = useState(toAnswer(initialValues?.prospective_org_ok_nearest));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!showOrgSearch) return undefined;
    const mine = ++requestId.current;
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const data = await api(sessionToken, `/orgs?q=${encodeURIComponent(query.trim())}`);
        if (mine !== requestId.current) return;
        setOrgs(Array.isArray(data?.orgs) ? data.orgs : []);
      } catch {
        if (mine !== requestId.current) return;
        setOrgs([]);
        setSearchError(true);
      } finally {
        if (mine === requestId.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [showOrgSearch, query, retryTick, sessionToken]);

  // On resume only the id is known: look the name up so the pick can be shown.
  useEffect(() => {
    const id = initialValues?.preferred_org_id;
    if (!id) return;
    api(sessionToken, `/orgs/${id}`).then((data) => {
      const name = data?.org?.name ?? data?.name;
      if (name) setSelectedName((n) => n ?? name);
    }).catch(() => {});
  }, [initialValues?.preferred_org_id, sessionToken]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  const leadReady = showLead && leadName.trim().length > 0;
  const canContinue = (Boolean(selectedId) || leadReady) && !submitting;

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      let updated;
      if (selectedId) {
        updated = await api(sessionToken, '/users/me/preferred-org', { method: 'POST', body: { org_id: selectedId } });
        // A listed org replaces any "not listed" lead, so the two never coexist.
        if (hasLead) updated = await patchProfile(sessionToken, { prospective_org_name: null, prospective_org_ok_nearest: null });
      } else {
        if (initialValues?.preferred_org_id) {
          await api(sessionToken, '/users/me/preferred-org', { method: 'POST', body: { org_id: null } });
        }
        const fields = { prospective_org_name: leadName.trim() };
        if (okNearest !== null) fields.prospective_org_ok_nearest = okNearest;
        updated = await patchProfile(sessionToken, fields);
      }
      onKnowsOrg(updated);
    } catch (err) {
      if (err.code === 'org_not_found') {
        setSelectedId(null);
        setSelectedName(null);
        retry();
      }
      setError(err.code === 'org_not_found' ? 'That organization is no longer listed. Pick another or tell us who.' : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function pickOrg(org) {
    setSelectedId((prev) => (prev === org.id ? null : org.id));
    setSelectedName(org.name);
    // A listed org replaces the "not listed" lead: close the form and drop what was typed.
    setShowLead(false);
    setLeadName('');
    setOkNearest(null);
    setError(null);
  }

  // Telling us about an unlisted org replaces any listed pick, so the pick must not look selected.
  function openLead() {
    setSelectedId(null);
    setSelectedName(null);
    setShowLead(true);
    setError(null);
  }

  function renderResults() {
    if (searching && orgs.length === 0) return <Loading label="Looking" />;
    if (searchError) {
      return (
        <View style={styles.state}>
          <ErrorLine message="We couldn't load organizations." />
          <LinkButton label="Retry" align="right" onPress={retry} style={styles.causeLink} />
        </View>
      );
    }
    if (orgs.length === 0) {
      return <Text style={[type.body, styles.state, { color: colors.ink2 }]}>{query.trim() ? 'No organization by that name yet' : 'No organizations listed yet'}</Text>;
    }
    return orgs.map((org) => {
      const picked = org.id === selectedId;
      const causes = Array.isArray(org.mission_tags) ? org.mission_tags : [];
      return (
        <Pressable
          key={org.id}
          onPress={() => pickOrg(org)}
          accessibilityRole="radio"
          accessibilityLabel={[org.name, org.location_label].filter(Boolean).join(', ')}
          accessibilityState={{ checked: picked }}
          style={({ pressed }) => [
            styles.orgRow,
            picked && styles.orgRowSelected,
            pressed && { backgroundColor: colors.tintPressed },
          ]}
        >
          <View style={styles.orgHead}>
            <Text style={[type.subtitle, { color: colors.ink, flex: 1 }]}>{org.name}</Text>
            {picked ? <Icon name="check" size={22} color={colors.ink} /> : null}
          </View>
          {org.location_label ? <Text style={[type.bodyS, { color: colors.ink2 }]}>{org.location_label}</Text> : null}
          {causes.length > 0 ? (
            <View style={styles.tags}>
              {causes.map((c) => <Tag key={c} label={c} tone="outline" />)}
            </View>
          ) : null}
        </Pressable>
      );
    });
  }

  return (
    <View style={s.container}>
      <KeyboardScroll
        header={<OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />}
        footer={
          showOrgSearch ? (
            <PrimaryButton label="Continue" onPress={handleContinue} disabled={!canContinue} loading={submitting} error={error} />
          ) : null
        }
      >
        <Headline>Do you already know where you want to volunteer?</Headline>
        <Text style={s.rationale}>
          Either way you'll end up in the same place — we just use this to skip straight to
          what's useful for you.
        </Text>

        {!showOrgSearch ? (
          <View style={styles.options}>
            <ListRow
              icon="search"
              label="I know an org"
              sublabel="Search for it by name"
              onPress={() => setShowOrgSearch(true)}
            />
            <ListRow
              icon="heart"
              label="Not sure — show me by cause"
              sublabel="Browse by what you care about"
              onPress={onBrowseByCause}
            />
          </View>
        ) : (
          <View style={s.field}>
            <Input
              label="Search organizations"
              placeholder="Organization name"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
            />
            {selectedId && selectedName && !orgs.some((o) => o.id === selectedId) ? (
              <Text style={[type.body, { color: colors.ink, marginTop: 8 }]}>Selected: {selectedName}</Text>
            ) : null}
            <View style={styles.results} accessibilityRole="radiogroup">{renderResults()}</View>

            {!showLead ? (
              <LinkButton label="Not listed? Tell us who" align="right" onPress={openLead} style={styles.causeLink} />
            ) : (
              <View style={styles.lead}>
                <Input
                  label="Organization name"
                  placeholder="Who would you like to volunteer with?"
                  value={leadName}
                  onChangeText={(v) => { setLeadName(v); if (v.trim()) { setSelectedId(null); setSelectedName(null); } }}
                />
                <Text style={[s.label, { marginTop: 16 }]}>
                  Until they join, are you happy to be matched with a similar organization nearby?
                </Text>
                <View style={styles.chipRow}>
                  <Chip label="Yes" role="radio" selected={okNearest === true} onPress={() => setOkNearest(true)} />
                  <Chip label="No" role="radio" selected={okNearest === false} onPress={() => setOkNearest(false)} />
                </View>
                {okNearest === false ? (
                  <Text style={[s.rationale, { marginTop: 8 }]}>
                    You'll only be matched when you start a search yourself.
                  </Text>
                ) : null}
              </View>
            )}
            <LinkButton label="Choose causes instead" align="right" onPress={onBrowseByCause} style={styles.causeLink} />
          </View>
        )}
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { marginTop: 16 },
  causeLink: { marginTop: 8, justifyContent: 'flex-start' },
  results: { marginTop: 8, gap: 8 },
  state: { marginTop: 8 },
  orgRow: {
    borderRadius: radii.notice,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.tint,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  orgRowSelected: { borderColor: colors.ink, backgroundColor: colors.selected },
  orgHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  lead: { marginTop: 16 },
  chipRow: { flexDirection: 'row', gap: 8 },
});
