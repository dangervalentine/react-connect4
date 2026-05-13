import PropTypes from 'prop-types';
import React from 'react';

const Container = props => (
  <div className="container">
    <div className="container-top" />
    <div className="container-body">{props.Columns}</div>
    <div className="container-bottom">Connect4</div>
  </div>
);

Container.propTypes = {
  Columns: PropTypes.array.isRequired
};

export default Container;
