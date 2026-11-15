interface MenuScreenProps {
  onNewCampaign: () => void;
  onHotSeat: () => void;
  onLan: () => void;
  onLoad: () => void;
}

export function MenuScreen({
  onNewCampaign,
  onHotSeat,
  onLan,
  onLoad,
}: MenuScreenProps) {
  return (
    <div className="rf-menu">
      <div className="rf-menu__atmosphere" aria-hidden />
      <div className="rf-menu__content rf-fade-in">
        <p className="rf-label rf-menu__eyebrow">Strategic Command Suite</p>
        <h1 className="rf-menu__brand">RISK FORCE</h1>
        <p className="rf-menu__subtitle">Earth Theater · 22nd Century</p>
        <div className="rf-menu__actions">
          <button type="button" className="primary" onClick={onNewCampaign}>
            New Campaign
          </button>
          <button type="button" onClick={onHotSeat}>
            Hot-Seat
          </button>
          <button type="button" onClick={onLan}>
            LAN
          </button>
          <button type="button" className="ghost" onClick={onLoad}>
            Load Game
          </button>
        </div>
      </div>
    </div>
  );
}
