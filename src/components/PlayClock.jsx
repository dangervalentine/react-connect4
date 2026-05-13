import PropTypes from 'prop-types';
import React from 'react';

const PlayClock = props => (
  <div className="playclock">
    <h2>Player {props.player} Time:</h2>
    <div className="playclock-time"> {props.time} </div>
  </div>
);

PlayClock.propTypes = {
  player: PropTypes.number.isRequired,
  time: PropTypes.number.isRequired
};

export default PlayClock;
