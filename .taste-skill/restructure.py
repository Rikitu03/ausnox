from pathlib import Path
p=Path('src/components/layout/primitives.tsx');s=p.read_text();s+='''
/** Native disclosure keeps supporting science one keyboard action away. */
export function Details({ title, children }: { title: string; children: ReactNode }) {
  return <details className="science-details group/details">
    <summary className="cursor-pointer rounded-ctl py-2 text-[13px] font-medium text-fg-2 marker:text-accent hover:text-fg">{title}</summary>
    <div className="space-y-3 pt-2 pb-1 text-[13px] leading-5 text-fg-2">{children}</div>
  </details>
}
''';p.write_text(s)
p=Path('src/features/mission-planner/PlannerPanel.tsx');s=p.read_text();s=s.replace('EmptyState, PanelHeader, Section, StatusAlert','Details, EmptyState, PanelHeader, Section, StatusAlert')
a=s.index('    <div className="num mt-1.5');b=s.index('\n  )',a)
s=s[:a]+'''    <div className="mt-3">
      {issue ? <p className="text-xs text-bad">Unknown terrain: {issue}</p> :
        <dl className="location-metrics"><div><dt>Elevation</dt><dd>{formatMetres(sample.elevationM, 1)}</dd></div><div><dt>Slope</dt><dd>{formatDegrees(sample.slopeDeg)}</dd></div></dl>}
      <Details title="Coordinates & reference">
        <p className="num text-xs break-words">x {formatGrid(position.x)} · y {formatGrid(position.y)}</p>
        {sample.geo && <p className="num text-xs break-words">{formatGeo(sample.geo.lonEast, 'lon')} · {formatGeo(sample.geo.latNorth, 'lat')}</p>}
        <p>{nominal ? 'Nominal coordinates; not a verified transform.' : 'Planetocentric coordinates, Mars 2000.'}</p>
      </Details>
    </div>'''+s[b:]
s=s.replace('<Section>\n          <label htmlFor={nameId}', '<Section title="Mission setup">\n          <label htmlFor={nameId}',1)
s=s.replace('<p className="num mt-1.5 text-xs text-fg-3">{config.id}</p>','<Details title="Mission identifier"><p className="num text-xs break-all">{config.id}</p></Details>')
# move route preference under setup
start=s.index('        <Section title="Route preference"');end=s.index('\n        <Section>',start)
route=s[start:end];s=s[:start]+s[end:]
route=route.replace('<Section title="Route preference" aside={<SourceBadge id="route-geometry" />}>','<div className="mt-3"><p className="mb-2 text-xs font-medium text-fg-2">Route preference</p>').replace('</Section>','</div>')
route=route[:route.index('          <p className="mt-2')]+'''          <Details title="About route preferences"><p>Shortest traversable minimizes distance on known terrain under the slope limit. Lower slope accepts extra distance to avoid steep ground and climbing.</p><SourceBadge id="route-geometry" /></Details></div>'''
s=s.replace('<Details title="Mission identifier">',route+'\n          <Details title="Mission identifier">')
s=s.replace('<Section title="Habitat" aside={<KindBadge kind="simulated" />}>','<Section title="Habitat" aside={<KindBadge kind="simulated" />}><div className="location-card">')
s=s.replace('<PlaceActions target="habitat" placed={!!config.habitat} />','<PlaceActions target="habitat" placed={!!config.habitat} /></div>')
s=s.replace('<Section title="Science destination">','<Section title="Science destination"><div className="location-card destination-card">')
s=s.replace('className="flex gap-3">\n              <span','className="flex gap-3">\n              <span',1)
# destination duration moves below location instead of squeezing title
start=s.index('              <NumberField\n                label={`Science time at ${config.destination.label}`}');end=s.index('\n            </div>',start)
field=s[start:end].replace('hideLabel','').replace('className="w-24 shrink-0"','className="mt-3 w-full"')
s=s[:start]+s[end:]; anchor='<PlaceActions target="destination" placed={!!config.destination} />';s=s.replace(anchor,'''{config.destination && ('''+field+''')}
          '''+anchor)
s=s.replace('          </div>\n        </Section>\n\n        <Section title="Science stops', '          </div></div>\n        </Section>\n\n        <Section title="Science stops')
s=s.replace('Science stops on the way out','Science stops')
s=s.replace('<p className="truncate text-[13px]">{s.label}</p>','<p className="text-[13px] font-medium leading-5">{s.label}</p>')
s=s.replace('''<p className="num text-xs text-fg-3">
                      x {formatGrid(s.position.x)} · y {formatGrid(s.position.y)}
                    </p>''','''<Details title="Location"><p className="num text-xs">x {formatGrid(s.position.x)} · y {formatGrid(s.position.y)}</p></Details>''')
s=s.replace('className="h-8 w-44"','className="h-8 w-full"')
s=s.replace("`Up to date · ${activeRoute.source.kind === 'mock' ? 'demonstration adapters, not the scientific engine' : 'scientific engine'}`","`Up to date · ${activeRoute.source.kind === 'mock' ? 'Demo results' : 'Calculated'}`")
p.write_text(s)
