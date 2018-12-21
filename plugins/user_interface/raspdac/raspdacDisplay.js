'use strict';

var STR_PAD_LEFT = 1;
var STR_PAD_RIGHT = 2;
var STR_PAD_BOTH = 3;

var DISPLAY_WIDTH = 16;
var DISPLAY_HEIGHT = 2;

var ANIMATION_SPEED = 500; // in milliseconds

var Lcd = require('lcd');
var Q = require('q');

if (!String.prototype.padEnd) {
  String.prototype.padEnd = function (count, str) {
  	var rep = count - str.length > 0 ? count - str.length : 0;
    return (this + (str || ' ').repeat(rep)).substr(0,count);
  };
}

if (!String.prototype.padStart) {
  String.prototype.padStart = function (count, str) {
    return (str || ' ').repeat(count).substr(0,count) + this;
  };
}

module.exports = raspdacDisplay;

function raspdacDisplay(context) {
	var self = this;

	self.displayTimer = undefined;
	self.currentState = undefined;
	self.elapsed = 0;
	self.lock = false;
	self.isInit = false;
	self.artistIndex = 0;
	self.closeRequested = false;

	self.context = context;
  	self.logger = self.context.logger;
  	self.logger.info("Raspdac initializing LCD");

	self.lcd = new Lcd({rs: 7, e: 8, data: [25, 24, 23, 27], cols: 16, rows: 2});

	self.lcd.on('ready', function() {
		self.isInit = true;		
		self.clear(function(err) {
			if (err) {
				self.logger.error(err);
			}
			self.logger.info("Raspdac LCD initialization ... OK");
			self.pushState(self.context.coreCommand.volumioGetState());	
			});		
	});
};


raspdacDisplay.prototype.pushState = function(state)  {
	var self = this;
	self.elapsed = state.seek;
	if (state.status === 'play') {		
		if (self._needStartDisplayInfo(state)) {
			self.endOfSong(function(err) {
				if (err) {
					self.logger.error(err);
				}
				self.displayInfo(state, 0);
			});
		}
	}
	else if (state.status === 'stop') {
		self.elapsed = 0;
		self.endOfSong();
	}
	else if (state.status === 'pause') {
		self.elapsed = state.seek;
	}
	self.currentState = state;
}

raspdacDisplay.prototype.close = function() {
	var self = this;
	if (!self.closeRequested) {
		self.closeRequested = true;
		if (self.displayTimer !== undefined) {
			clearInterval(self.displayTimer);
			self.displayTimer = undefined;
		}
		setTimeout( function () {
			if (self.lcd !== undefined)
			{
				self.lcd.close();
				self.lcd = undefined;
			}
		}, ANIMATION_SPEED + 10);
	}
};

raspdacDisplay.prototype.clear = function(cb) {
	var self = this;
	if (self.isInit && self.lcd !== undefined) {
		self.lcd.clear(cb);
	}
};


raspdacDisplay.prototype.endOfSong = function(cb) {
	var self = this;

	if (self.displayTimer !== undefined) {
		clearInterval(self.displayTimer);
		self.displayTimer = undefined;
	}
	self.artistIndex = 0;	
	self.clear(cb);
}

raspdacDisplay.prototype.displayInfo = function(data) {
	var self = this;
	if (!self.lock && self.isInit) {
		self.lock = true;
	 	var duration = data.duration;

		if (self.elapsed >= duration * 1000) {
			self.endOfSong();
		}
		else {
		    //self.lcd.clear();
		    // Display artist info
		    var artistInfo = data.artist + '-' + data.title;
		    var buff = artistInfo;
		    if (buff.length > DISPLAY_WIDTH) {
		    	buff = artistInfo + '          ' + artistInfo.substr(0, DISPLAY_WIDTH);
		    }
		    else {
		    	buff = buff + (' ').repeat(DISPLAY_WIDTH-buff.length);
		    	buff = buff.substr(0, DISPLAY_WIDTH);
		    }

		    if (self.artistIndex >= buff.length - DISPLAY_WIDTH) {
		    	self.artistIndex = 0;
		    }
		    if (self.lcd !== undefined)
			{
			    self._print(buff.substr(self.artistIndex, DISPLAY_WIDTH), 0, 0, function(err) {
			    	if (err) {
			    		self.logger.error(err);
			    	}  
			  	    // Display duration
			  	    self._print(self._formatDuration(self.elapsed,duration), 1, 0, function(err) {
			  	    	if (self.displayTimer === undefined)
			  	    	{
				  	    	self.displayTimer = setInterval( function () {
				  	    		if (self.currentState.status != 'pause') {
				  	    			self.elapsed += ANIMATION_SPEED;				  	    			
				  	    		}				  	    		
				  	    		self.displayInfo(data);
				  	    	}, ANIMATION_SPEED);
			  	    	}
			  	    	self.artistIndex += 1;
			  	    });
			  	});
			}
		}
		self.lock = false;
	}
	else {
		self.logger.info('Raspdac : display info locked... skipped');
	}
}

// private
raspdacDisplay.prototype._print  = function(str, line, column, cb) {
	var self = this;
	if (self.isInit && (self.lcd !== undefined)) {
		self.lcd.setCursor(column, line);
		self.lcd.print(str, cb);
	}
}

//private
raspdacDisplay.prototype._formatDuration = function(seek, duration) {
  var self = this;
  var seek_sec = Math.ceil(seek / 1000).toFixed(0);
  var seek_min = Math.floor(seek_sec / 60);
  seek_sec = seek_sec - seek_min * 60;
  
  var dur_min = Math.floor(duration / 60);
  var dur_sec = duration - dur_min * 60;

  if (seek_sec < 10) {seek_sec = "0"+seek_sec;}
  if (dur_sec < 10) {dur_sec = "0"+dur_sec;}  
  
  var dur = '   '+seek_min+'.'+seek_sec+':'+dur_min+'.'+dur_sec+'   ';

  return dur.substr(0,DISPLAY_WIDTH);
}

//private
raspdacDisplay.prototype._needStartDisplayInfo = function(state) {
  var self = this;
  return  (typeof(self.currentState) === 'undefined' ||
  		  (state.status === 'play' && self.currentState.status === 'stop') ||
          self.currentState.artist !== state.artist || 
  	  	  self.currentState.title !== state.title);
}
