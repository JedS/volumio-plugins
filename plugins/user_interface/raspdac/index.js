
'use strict';

var io = require('socket.io-client');
var libQ = require('kew');
var fs = require('fs-extra');
var Gpio = require('onoff').Gpio;
var config = new (require('v-conf'))();
var raspdacDisplay = require('./raspdacDisplay');

// Define the ControllerRaspDac class
module.exports = ControllerRaspDac;

function ControllerRaspDac(context) {
      // This fixed variable will let us refer to 'this' object at deeper scopes
      var self = this;

      self.context = context;
      self.commandRouter = this.context.coreCommand;
      self.logger = this.context.logger;
      // Set LCD
      self.raspdacDisplay = null;
}

ControllerRaspDac.prototype.onVolumioStart = function()
{
      var self = this;
      self.logger.info("Raspdac initialized");      

      return libQ.resolve();
}

ControllerRaspDac.prototype.onVolumioReboot = function()
{
      var self = this;
      var defer = libQ.defer();
      self.logger.info('Raspdac : Volumio reboot called');

      self._closeDisplay()
      .then( function() {
            setTimeout(function() { 
                  self.softShutdown.writeSync(1);
                  self.bootOk.writeSync(1); 
                  defer.resolve();
            } , 2000);  
      });

      return defer.promise;
}

ControllerRaspDac.prototype.onVolumioShutdown = function()
{
      var self = this;
      var defer = libQ.defer();
      
      self.logger.info('Raspdac : Volumio shutdown called');

      self._closeDisplay()
      . then( function() {
            self.softShutdown.writeSync(1);
            setTimeout(function() 
            {
                  self.softShutdown.writeSync(0);
                  defer.resolve();
            }, 1000);
            self.bootOk.writeSync(0);
      });
      
      return defer.promise;
}

ControllerRaspDac.prototype.getConfigurationFiles = function()
{
      return ['config.json'];
}

// Plugin methods -----------------------------------------------------------------------------
ControllerRaspDac.prototype.onStart = function() {
      var self = this;

      var defer = libQ.defer();

      self.configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');
      self.config = new (require('v-conf'))();
      self.config.loadFile(self.configFile);

      // Set Button GPIO
      //self.softShutdown = new Gpio(4, 'out');
      //self.shutdownButton = new Gpio(17, 'in', 'both');
      //self.bootOk = new Gpio(22, 'high');

      if(self.tryParse(self.config.get('soft_shutdown'), 0) != 0)
      {
            self.softShutdown = new Gpio(parseInt(self.config.get('soft_shutdown')), 'out')
            self.logger.info('Soft shutdown GPIO binding... OK');
      }
      
      if(self.tryParse(self.config.get('shutdown_button'), 0) != 0)
      {
            self.shutdownButton = new Gpio(parseInt(self.config.get('shutdown_button')), 'in', 'both');
            self.logger.info('Hardware button GPIO binding... OK');
      }
      
      if(self.tryParse(self.config.get('boot_ok'), 0) != 0)
      {
            self.bootOk = new Gpio(parseInt(self.config.get('boot_ok')), 'high');
            self.logger.info('Boot OK GPIO binding... OK');
      }

      self.shutdownButton.watch(self.hardShutdownRequest.bind(this));

      self.raspdacDisplay = new raspdacDisplay(self.context);
      self.raspdacDisplay.initDisplay()
      .then( function()
      {
            //self.applyConf(self.getConf());
            self.logger.info("RaspDac started... OK");
            self.raspdacDisplay.pushState(self.context.coreCommand.volumioGetState());
            defer.resolve();
      });

      return defer.promise;
};

ControllerRaspDac.prototype.onStop = function() {
      var self = this;
      var defer = libQ.defer();  

      self.logger.info('Stopping Raspdac plugin...');

      self.logger.info('Releasing Raspdac LDC...');
      self._closeDisplay()
      .then( function() {
            self.logger.info('Releasing Raspdac LDC...OK');

            self.shutdownButton.unwatchAll();
            self.shutdownButton.unexport();
            self.bootOk.unexport();
            self.softShutdown.unexport();            
            
            self.logger.info('Stopping Raspdac plugin ...OK'); 
            defer.resolve();          
      });      

     return defer.promise;
};

ControllerRaspDac.prototype.onRestart = function() {
      var self = this;
      var defer = libQ.defer();

      self.logger.info('Restarting Raspdac...');
      self.logger.info('Releasing Raspdac LDC...');
      self._closeDisplay()
      .then(function() {
            defer.resolve(); 
      });
      return defer.promise;
};

ControllerRaspDac.prototype.getConf = function(varName) {
      var self = this;
      self.config = new (require('v-conf'))()
      self.config.loadFile(self.configFile)

      return libQ.resolve();
};

ControllerRaspDac.prototype.setConf = function(varName, varValue) {
      var self = this;
      //Perform your installation tasks here
};

ControllerRaspDac.prototype.applyConf = function(conf) {
      var self = this;
};

ControllerRaspDac.prototype.getUIConfig = function() {
      var self = this;
      var defer = libQ.defer();    
      var lang_code = this.commandRouter.sharedVars.get('language_code');
      self.getConf(this.configFile);
      self.logger.info("Loaded the previous config.");
            
      self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
      .then(function(uiconf)
      {
            self.logger.info("## populating UI...");
            
            // GPIO configuration
            uiconf.sections[0].content[0].value = self.config.get('soft_shutdown');
            uiconf.sections[0].content[1].value = self.config.get('shutdown_button');
            uiconf.sections[0].content[2].value = self.config.get('boot_ok');       
            self.logger.info("1/1 settings loaded");
            
            self.logger.info("Populated config screen.");
            
            defer.resolve(uiconf);
      })
      .fail(function()
      {
            defer.reject(new Error());
      });

      return defer.promise;
};

ControllerRaspDac.prototype.setUIConfig = function(data) {
      var self = this;
      self.logger.info("Updating UI config");
      var uiconf = fs.readJsonSync(__dirname + '/UIConfig.json');

      return libQ.resolve();
};

ControllerRaspDac.prototype.updateButtonConfig = function (data)
{
      var self = this;
      
      self.config.set('soft_shutdown', data['soft_shutdown']);
      self.config.set('shutdown_button', data['shutdown_button']);
      self.config.set('boot_ok', data['boot_ok']);
      
      self.commandRouter.pushToastMessage('success', 'Successfully saved the new configuration.');
      return libQ.resolve();
};

ControllerRaspDac.prototype.tryParse = function(str,defaultValue) {
      var retValue = defaultValue;
      if(str !== null) {
            if(str.length > 0) {
                  if (!isNaN(str)) {
                        retValue = parseInt(str);
                  }
            }
      }
      return retValue;
};

// user_interface plugin Methods
ControllerRaspDac.prototype.pushState = function(state) {
      var self = this;  
      self.raspdacDisplay.pushState(state);
      return libQ.resolve();
}

ControllerRaspDac.prototype.pushQueue = function(state) {
      var self = this;
      return libQ.resolve();
}

// Public Methods ---------------------------------------------------------------------------------------

// Button Management
ControllerRaspDac.prototype.hardShutdownRequest = function(err, value) {
// if the hard shutdown is activated should be ok to just shutdown. 
      // the "bootOK" GPIO will turn off as part of the system shutdown.
      // ...after which the power will be cut a few seconds later by the hardware
      self.commandRouter.shutdown();
};

// Private Methods
ControllerRaspDac.prototype._closeDisplay = function() 
{
      var self = this;
      var defer = libQ.defer();
      if (self.raspdacDisplay) {
            self.raspdacDisplay.endOfSong(function(err) {
                  self.raspdacDisplay.close();
                  self.raspdacDisplay = null;
                  defer.resolve();   
            });
      }
      else
            self.logger.info('------------------- Rasdac : display already clean');

      return defer.promise;
}
