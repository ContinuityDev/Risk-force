import { InstallPrompt } from "./InstallPrompt";

interface MenuScreenProps {
  onNewCampaign: () => void;
  onHotSeat: () => void;
  onLan: () => void;
  onLoad: () => void;
  onResume?: () => void;
  canResume?: boolean;
  onTutorial?: () => void;
  onReplayTutorial?: () => void;
  canResumeTutorial?: boolean;
  canReplayTutorial?: boolean;
}

export function MenuScreen({
  onNewCampaign,
  onHotSeat,
  onLan,
  onLoad,
  onResume,
  canResume = false,
  onTutorial,
  onReplayTutorial,
  canResumeTutorial = false,
  canReplayTutorial = false,
}: MenuScreenProps) {
  return (
    <div className="rf-menu">
      <div className="rf-menu__atmosphere" aria-hidden />
      <div className="rf-menu__content rf-fade-in">
        <p className="rf-label rf-menu__eyebrow">Strategic Command Suite</p>
        <h1 className="rf-menu__brand">RISK FORCE</h1>
        <p className="rf-menu__subtitle">Earth Theater · 22nd Century</p>
        <div className="rf-menu__actions">
          {canResume && onResume && (
            <button type="button" className="primary" onClick={onResume}>
              Resume Campaign
            </button>
          )}
          <button
            type="button"
            className={canResume ? undefined : "primary"}
            onClick={onNewCampaign}
          >
            New Campaign
          </button>
          {onTutorial && (
            <button type="button" onClick={onTutorial}>
              {canResumeTutorial ? "Resume Tutorial" : "Tutorial"}
            </button>
          )}
          {onReplayTutorial && (canReplayTutorial || canResumeTutorial) && (
            <button type="button" className="ghost" onClick={onReplayTutorial}>
              Replay Tutorial
            </button>
          )}
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
        <InstallPrompt />
      </div>
    </div>
  );
}
