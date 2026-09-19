import logo from '../logo.svg';

/**
 * The app bar: mark, wordmark, credit. Same two parts in the same order and
 * the same credit line as the sibling projects wear, so they read as a set.
 *
 * The mark is decorative — `alt=""` rather than a description — because the
 * title it sits beside already says the app's name, and a screen reader
 * announcing "Connect 4 logo, Connect 4" is worse than announcing it once.
 *
 * It's the same artwork as public/favicon.svg, copied into src/ rather than
 * referenced across: public/ assets aren't importable modules, and hardcoding
 * the served path would break under the GitHub Pages base subpath.
 */
export const Header = () => (
  <header className="app-header">
    <img className="logo" src={logo} alt="" />

    <div className="header-text">
      <p className="title">Connect 4</p>
      <a
        className="credit"
        href="https://github.com/dangervalentine/react-connect4"
        target="_blank"
        rel="noopener noreferrer"
      >
        <p>by Danger Valentine</p>
      </a>
    </div>
  </header>
);
