import type { ReactNode } from 'react';

type ContainerProps = {
  columns: ReactNode;
};

const Container = ({ columns }: ContainerProps) => (
  <div className="container">
    <div className="container-top" />
    <div className="container-body">{columns}</div>
    <div className="container-bottom">Connect4</div>
  </div>
);

export default Container;
