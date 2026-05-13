const Container = ({ columns }) => (
  <div className="container">
    <div className="container-top" />
    <div className="container-body">{columns}</div>
    <div className="container-bottom">Connect4</div>
  </div>
);

export default Container;
