/* Magic Mirror
 * Module: BoredDaily
 *
 * By CptMeetKat
 * MIT Licensed.
 */

Module.register("NextTrains", {
    
    trains: [],
    realTimeUpdates: null,
    welcomeMessage: "Welcome to NextTrains!",
    welcomed: false,
    // Default module config.
    defaults: {
        updateInterval : 10, //Seconds before changeing
        station: "",
        maxTrains: 4,
        lateCriticalLimit: 600,
        etd: false,
        delaysFormat: "m", //"m, s, m:s"
        debug: false
    },

    context: {
        id: null,
        station: "",
        maxTrains: 0,
        departedAfter: "" //HH:MM:SS
    },

    start: function() {
        this.config.updateInterval = this.config.updateInterval * 1000
        this.context.id = this.identifier;
        this.context.station = this.config.station;
        this.context.maxTrains = this.config.maxTrains;

        this.getRealTimeUpdates();
        this.getTrains();
        setInterval(() => {
            this.getTrains();
            this.getRealTimeUpdates();
        }, this.config.updateInterval);

    },

    initialMessage: function() {
        let x = document.createElement("div");
        if(!this.welcomed)
        {
            x.innerHTML = this.welcomeMessage;
            this.welcomed = true;
        }
        else
            x.innerHTML = "Loading...";
        return x
    },


    createDateTimeFromTime: function(time) {
        let d = new Date()
        var datestring = d.getFullYear()  + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2)

        return new Date(datestring + "T" + time)
    },

    getDifferenceInMinutes: function(d1, d2)
    {
        var diffMs = (d1 - d2); // milliseconds between d1 & d2
        // var diffDays = Math.floor(diffMs / 86400000); // days
        // var diffHrs = Math.floor((diffMs % 86400000) / 3600000); // hours
        var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000); // minutes

        return diffMins;
    }, 

    getHeader: function() {
        return this.name + ": " + this.config.station;
    },

    createTableHeader: function() {
        let header_row = document.createElement('tr')
        header_row.className = "align-left regular xsmall dimmed"
        
        let header_destination = document.createElement('td')
        let route = document.createElement('td')
        let header_time = document.createElement('td')
        let delay = document.createElement('td')

        
        header_destination.innerText = "Platform"
        route.innerText = "Route"
        header_time.innerText = "Departs"
        delay.innerText = "";
        
        header_row.appendChild(header_destination);
        header_row.appendChild(route);
        header_row.appendChild(header_time);
        header_row.appendChild(delay);
        
        return header_row
    },

    getDelayClass: function(type)
    {
        let cssClass = "";
        if(type == -1)
            cssClass = "early-mild"
        else if(type == 1)
            cssClass = "late-mild";
        else if(type == 2)
            cssClass = "late-critical";

        return cssClass;
    },

    getDelayFormat: function(secondsDelayed)
    {
        let delay = document.createElement('td');

        let mins = parseInt(secondsDelayed/60);
        let isMinsNotZero = mins != 0;
        let isSecsNotZero = secondsDelayed != 0;

        if ( this.config.debug && isSecsNotZero) // +m:s (+s)
            delay.innerText = "+" + mins + ":" + (secondsDelayed%60) + " (+" + secondsDelayed + "s)";
        else if( this.config.delaysFormat == "m:s" && isSecsNotZero) //+m:s
            delay.innerText = "+" + mins + ":" + (secondsDelayed%60);
        else if( this.config.delaysFormat == "m" && isMinsNotZero)  //+min
            delay.innerText = "+" + mins + "m";
        else if ( this.config.delaysFormat == "s" && isSecsNotZero) // +s
            delay.innerText = "+" + secondsDelayed + "s";

        return delay;
    },


    createTrainRow: function(destination_name, route_name, departure, secondsDelayed=0, type=0) {
        let row = document.createElement('tr');
        row.className = "align-left small normal";

        let classA = this.getDelayClass(this.getDelayType(secondsDelayed));
        if(classA != "")
            row.classList.add(   classA   );
        
        let destination = document.createElement('td');
        let route = document.createElement('td');
        let time = document.createElement('td');
        let delay = this.getDelayFormat(secondsDelayed);

        destination.innerText = destination_name;
        route.innerText = route_name;
        time.innerText = departure;

        row.appendChild(destination);
        row.appendChild(route);
        row.appendChild(time);
        row.appendChild(delay);

        return row;
    },

    getDom: function() {

        if(this.trains.length == 0)
            return this.initialMessage();

        const wrapper = document.createElement("table");
        const header_row = this.createTableHeader();
        wrapper.appendChild(header_row);

        let row = null;
        this.trains.forEach(t => {

            // Compress this all into some sort of class

            let departureDTPlanned = this.createDateTimeFromTime(t.departure_time);
            let minsUntilTrain = this.getDifferenceInMinutes(departureDTPlanned, new Date());
            
            let secondsModifier = this.findLateSeconds(t);
            let departureTimeActual = departureDTPlanned;
            departureTimeActual.setSeconds(departureTimeActual.getSeconds() + secondsModifier);
            
            let departureTimeActualLocal = departureTimeActual.toLocaleTimeString();
            let delayType = this.getDelayType(secondsModifier);

            let platform = t["stop_name:1"].split(' ').pop();
            let departureDisplay = "";

            if(this.config.debug)
                departureDisplay =  (minsUntilTrain + parseInt(secondsModifier/60))+"m" + " - " + t.departure_time + " (" + departureTimeActualLocal + ")";
            else if(this.config.etd)
                departureDisplay = departureTimeActualLocal;
            else
                departureDisplay = (minsUntilTrain + parseInt(secondsModifier/60))+"m";

            row = this.createTrainRow( platform, t.trip_headsign, departureDisplay, secondsModifier, delayType);

            wrapper.appendChild(row)
        });

        return wrapper;
    },

    getDelayType: function(secondsLate) {
        let type = 0;
        if(secondsLate >= this.config.lateCriticalLimit)
            type = 2;
        else if(secondsLate > 0)
            type = 1;
        else if(secondsLate < -1)
            type = -1;

        return type;
    },

    findLateSeconds: function(train) {
        // This function could most certainly be sped up with a hashtable

        if (!this.realTimeUpdates) {
            return 0;
        }

        let arr = this.realTimeUpdates.entity;
        for (let i in arr) {
                
            let type = arr[i].tripUpdate.trip.scheduleRelationship;
            if(type == undefined || type == "SCHEDULED") 
            {   
                if(train.trip_id == arr[i].tripUpdate.trip.tripId )    
                {
                    for (let j in arr[i].tripUpdate.stopTimeUpdate) 
                    {
                        if(arr[i].tripUpdate.stopTimeUpdate[j].stopId == train.stop_id)
                            return arr[i].tripUpdate.stopTimeUpdate[j].departure.delay;
                    }
                }
            }
        }

        return 0;
    },


   socketNotificationReceived: function(notification, payload) {

        if(payload.id != this.context.id)
        {
            // console.log(payload); // Only print payload if we own it
            return;
        }
        
        if (notification === "ACTIVITY")
            this.trains = payload.trains;
        else if(notification === "REALTIME_DATA")
            this.realTimeUpdates = payload.updates;

        this.updateDom(1000);
    },

    getTrains: function() {
        Log.info(this.name + ": Getting trains");
        
        let now = new Date(); 
        this.context.departedAfter = now.toLocaleTimeString(); //Retrieve trains from after now

        this.sendSocketNotification("GET_TRAINS", {
            context: this.context 
        });
    },

    getRealTimeUpdates: function() {
        Log.info(this.name + ": Getting real time updates");

        this.sendSocketNotification("GET_REALTIME", {
            context: this.context//Needs its own context, tbh maybe both context should be local to their function..investigate
        });
    },

    // Define required styles.
    getStyles: function() {
        return ["nextTrains.css"];
    }

});
