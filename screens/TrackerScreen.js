import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { openDatabase, } from "react-native-sqlite-storage";
import { useFocusEffect } from '@react-navigation/native';

const db = openDatabase({ name: 'trackerDatabase.db' }); //haetaan trackerdatabase

const TrackerScreen = () => {
  const [location, setLocation] = useState(null); //Muuttuja mihin haetaan tämän hetkinen sijainti
  const [region, setRegion] = useState(null); //Muuttuja määrittelemään kartan aloituspistettä
  const distanceTraveled = useRef(0); // Uusi kuljettu matka. Tässä käytetään useRef-koukkua, mikä ei aiheuta uudelleenrenderöintiä arvon muuttuessa.
  const prevLocation = useRef(null); // Aikaisempi sijainti. Tässä käytetään useRef-koukkua, mikä ei aiheuta uudelleenrenderöintiä arvon muuttuessa.
  const [tracking, setTracking] = useState(false); // Lenkin käynnistyksen seuranta
  const [isPaused, setIsPaused] = useState(false); // Onko lenkki keskeytetty
  const [elapsedTime, setElapsedTime] = useState(0); // Kellolaskuri
  const intervalRef = useRef(null);
  const [startButtonVisible, setStartButtonVisible] = useState(true); // Onko start-nappi näkyvissä
  const [pauseButtonVisible, setPauseButtonVisible] = useState(false); // Onko jatka-nappi näkyvissä
  const [saveButtonVisible, setSaveButtonVisible] = useState(false); // Onko tallennus-nappi näkyvissä
  const [showFinalDetails, setShowFinalDetails] = useState(false); // Näytetään lopuksi lopullinen matka
  const [averageSpeedPerHour, setAverageSpeedPerHour] = useState(0); //Keskinopeus tunnissa
  const [polylineCoordinates, setPolylineCoordinates] = useState([]); // Tallentaa polyline-viivan koordinaatit
  const [startTime, setStartTime] = useState(null); // Lenkin alkamisaika
  const [endTime, setEndTime] = useState(null); // Lenkin päättymisaika
  const [modalVisible, setModalVisible] = useState(false);


  useFocusEffect( //Tällä saadaan päivitettyä ruudun tiedot joka kerta, kun ruutu avataan.
  useCallback(() => {
    fetchCurrentPosition();
  }, [])
  );

  const fetchCurrentPosition = () => {
    // Haetaan nykyinen sijainti. Tämä kutsutaan joka kerta, kun tämä näkymä avataan. Kutsutaan myös lenkkitietojen tallennuksen jälkeen.
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
        setRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      },
      error => console.log(error),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
  };

  useEffect(() => { //Luodaan SQLite table
    db.transaction((tx) => {
      tx.executeSql(
        'CREATE TABLE IF NOT EXISTS trackerDatabase (id INTEGER PRIMARY KEY AUTOINCREMENT, pvm TEXT NOT NULL, aloitusAika TEXT NOT NULL, lopetusAika TEXT NOT NULL, matkaPituus REAL NOT NULL, lopullinenAika REAL NOT NULL, keskiVauhti REAL NOT NULL, keskiNopeus REAL NOT NULL, reittiKoordinaatit TEXT)',
        []
      );
    });
  }, []);


  useEffect(() => {
    let watchId;
    
    if (tracking && !isPaused) { //Seuranta käynnistetään, jos tracking-tila on true
      watchId = Geolocation.watchPosition( //haetaan tämänhetkinen sijainti, joka kerta kun sijainti muuttuu
      updateLocation,
      (error) => console.log(error),
      {
        enableHighAccuracy: true,
        distanceFilter: 1, // Päivitetään koordinaatit jokaisen metrin jälkeen
        interval: 5000, // Päivitetään sijainti viiden sekunnin välein
        fastestInterval: 2000, // Nopein mahdollinen päivitysväli on 2 sekuntia
        timeout: 30000,
        maximumAge: 0
      }
      );

      intervalRef.current = setInterval(() => { // Käynnistetään sekuntilaskuri
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      // Lopetetaan sekuntilaskurin päivitys
      clearInterval(intervalRef.current);
    }

    return () => Geolocation.clearWatch(watchId); //clearWatch -funktio lopettaa sijainnin seurannan
  }, [tracking, isPaused]); //Tracking riippuvuus


  const updateLocation = (position) => { //päivitetään aina uusien sijaintien päivittyessä sijainti kartalle
    const { latitude, longitude } = position.coords; //haetaan geolocation.watchpositionin hakemat latitude ja longitude
    const newCoordinate = { latitude, longitude };
    console.log(latitude, longitude) //tulostetaan konsoliin nykyinen uusi sijainti. kaikki tiedot saa tulostamalla position

    if (prevLocation.current && tracking  && !isPaused) { //Jos löytyy edellinen sijainti ja tracking on päällä
      const distance = calculateDistance(prevLocation.current, { latitude, longitude }); //Lähetetään laskuriin edelliset koordinaatit ja uudet koordinaatit
      distanceTraveled.current += distance; // Lisätään kuljettuun matkaan uusi matka edellisten ja nykyisten koordinaattien väliltä
    }

    setLocation({ latitude, longitude });  //määritetään sijainti. tätä muuttujaa käytetään markerin siirtämiseen ja alussa latituden ja longituden näyttämiseen ruudulla
    setRegion({ //kartan sijainnin tiedot päivitetään
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });

    prevLocation.current = { latitude, longitude };
    setPolylineCoordinates(prevState => [...prevState, newCoordinate]); // Lisätään uusi koordinaatti koordinaattilistaan
  };


  const startTracking = () => { //Kun lenkki ja laskenta alkaa
    setTracking(true); //Laitetaan tracking-tila päälle
    setStartTime(new Date()); // Asetetaan alkamisaika
    setElapsedTime(0); //Nollataan sekuntikello
    setAverageSpeedPerHour(0); // Nollataan keskinopeus
    distanceTraveled.current = 0; //Nollataan kuljettu matka
    setStartButtonVisible(false); // Piilotetaan "Start Tracking" -nappi, kun sitä on painettu ja asetetaan "Stop Tracking" -nappi näkyviin
    setPauseButtonVisible(true);
    setShowFinalDetails(false); // Määritellään lopuksi näkyvä matka false, siltä varalta, jos lenkkiä jatketaan
    setPolylineCoordinates([]); // Tyhjennetään koordinaattilista uutta lenkkiä varten
    setModalVisible(true);
  }


  const stopTracking = async () => { //Kun lenkki päättyy
    setTracking(false);
    setEndTime(new Date()); // Asetetaan päättymisaika
    setStartButtonVisible(true); // Asetetaan "Aloita lenkki" -nappi näkyviin, kun "Lopeta lenkki" -nappia painetaan.
    setSaveButtonVisible(true); // Asetetaan "Tallenna lenkki"- ja "Poista lenkki" -napit näkyviin, kun "Lopeta lenkki" -nappia painetaan.
    setShowFinalDetails(true);
    setAverageSpeedPerHour(((distanceTraveled.current / elapsedTime) / 1000) * 3600); // Lasketaan lenkin keskinopeus
  }


  const pauseTracking = () => { //Lenkin keskeytys
    setIsPaused(true);
    setPauseButtonVisible(false);
  };


  const resumeTracking = () => { //Lenkin jatkaminen
    setIsPaused(false);
    setPauseButtonVisible(true);
  };


  const saveTracking = () => { //Tallennetaan lenkin tiedot tietokantaan
    const dateOfRun = startTime.toLocaleDateString('fi-FI', { timeZone: 'UTC' }); // Lenkin päivämäärä
    const runStartTime = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); // Lenkin aloitusaika
    const runEndTime = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); // Lenkin päättymisaika
    const totalDistance = (distanceTraveled.current / 1000).toFixed(2); // Lenkin kokonaismatka
    const totalDuration = formatTime(elapsedTime); // Lenkin lopullinen aika
    const pace = calculateMinutesPerKilometer(); // Keskivauhti
    const averageSpeed = averageSpeedPerHour.toFixed(2); // Keskinopeus
    const routeCoordinates = polylineCoordinates; // Koordinaatit

    console.log('Tallennetaan tietokantaan tiedot:'); //Nämä ovat ainoastaan testausta varten
    console.log(dateOfRun);
    console.log(runStartTime);
    console.log(runEndTime);
    console.log(totalDistance);
    console.log(totalDuration);
    console.log(pace);
    console.log(averageSpeed);
    console.log(routeCoordinates);    

    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO trackerDatabase (pvm, aloitusAika, lopetusAika, matkaPituus, lopullinenAika, keskiVauhti, keskiNopeus, reittiKoordinaatit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [dateOfRun, runStartTime, runEndTime, totalDistance, totalDuration, pace, averageSpeed, JSON.stringify(routeCoordinates)],
        (tx, results) => {
          if (results.rowsAffected > 0) {
            console.log('Data tallennettu tietokantaan onnistuneesti');
          } else {
            console.log('Datan tallennus epäonnistui');
          }
        },
        error => {
          console.log('Error: ' + error.message);
        }
      );
    });
    eraseTrackingInfo(); //Nollataan vielä kaikki tiedot tallennuksen lopuksi, niin päästään alkutilanteeseen
  };
  

  const eraseTrackingInfo =  () => {
    //Nollataan kaikki tiedot
    setIsPaused(false);
    setElapsedTime(0);
    distanceTraveled.current = 0;
    prevLocation.current = null;
    setPauseButtonVisible(false);
    setSaveButtonVisible(false);
    setShowFinalDetails(false);
    setAverageSpeedPerHour(0);
    setPolylineCoordinates([]);
    setLocation(null);
    setRegion(null);
    setStartTime(null);
    setEndTime(null);
    fetchCurrentPosition(); //Haetaan nykyinen sijainti uudestaan, koska sivu ei päivity alkunäkymään, jos location -muuttujalla ei ole arvoa.
    setModalVisible(false);
    };


  const calculateDistance = (prevCoords, newCoords) => { //Netistä kopioitu Haversinen formula matkan laskemiseen
    const { latitude: lat1, longitude: lon1 } = prevCoords;
    const { latitude: lat2, longitude: lon2 } = newCoords;
    const R = 6371e3; // Radius of the Earth in meters
    const φ1 = lat1 * Math.PI / 180; // Convert degrees to radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };


  const formatTime = (time) => { //Netistä kopioitu apufunktio kuluneen ajan muotoilemiseksi
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time - hours * 3600) / 60);
    const seconds = time - hours * 3600 - minutes * 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  
  const calculateMinutesPerKilometer = () => { //Laskuri, mikä laskee monta minuuttia kilometreissä.
    if (distanceTraveled.current === 0) return "0:00"; // Vältetään nollalla jakamista
    const timeInMinutes = elapsedTime / 60; // Aika minuuteiksi
    const minutesPerKilometer = timeInMinutes / (distanceTraveled.current / 1000); // Minuutit per kilometri
    const minutes = Math.floor(minutesPerKilometer); // Kokonaiset minuutit
    const seconds = Math.round((minutesPerKilometer - minutes) * 60); // Sekunnit
    return `${minutes}:${seconds.toString().padStart(2, '0')}`; // Palautetaan aika muodossa mm:ss
  };

  return (
    <View style={styles.container}>
      {location && (
      <>
      <MapView
                style={styles.map}
                mapType={"standard"}
                provider={PROVIDER_GOOGLE}
                showsMyLocationButton={true}
                showsUserLocation={true}
                region={region}
              >
      </MapView>
      <View style={styles.startContainer}>
      <TouchableOpacity onPress={startTracking} style={styles.appButtonContainer1}>
        <Text style={styles.buttonText}>Aloita lenkki</Text>
      </TouchableOpacity>
      </View>
      </>
      )}
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.container2}>
          {location && ( //Tämä  tarkoittaa, että jatkaa sitten vasta kun location muuttujalla on arvo
            <>
              <MapView
                style={styles.map}
                mapType={"standard"}
                provider={PROVIDER_GOOGLE}
                showsMyLocationButton={true}
                showsUserLocation={true}
                region={region}
              >
                {tracking && (
                  <Polyline
                    coordinates={polylineCoordinates}
                    strokeWidth={4}
                    strokeColor={"#ff0000"}
                  />
                )}
                {showFinalDetails && ( //Kun lenkki on päättynyt näytetään lopuksi kartalla kuljettu matka viivalla 
                  <Polyline
                    coordinates={polylineCoordinates}
                    strokeWidth={4}
                    strokeColor={"#ff0000"}
                  />
                )}
              </MapView>

              <View style={styles.trackerContainer}>
                {tracking && (
                  <>
                    <View style={styles.trackingContainer}>
                      <Text style={styles.distanceText1}>Matka</Text>
                      <Text style={styles.distanceText2}>{(distanceTraveled.current / 1000).toFixed(2)} km</Text>
                      <Text style={styles.distanceText1}>Aika</Text>
                      <Text style={styles.distanceText2}>{formatTime(elapsedTime)}</Text>
                      <Text style={styles.distanceText1}>Keskivauhti</Text>
                      <Text style={styles.distanceText2}>{calculateMinutesPerKilometer()} min/km</Text>
                    </View>
                  </>
                )}

                <View style={styles.finalDetailsContainer}>
                  {showFinalDetails && ( //Kun lenkki on päättynyt näytetään lenkin tiedot ruudulla
                    <>
                      <View style={styles.finalDetailsColumn}>
                        <Text style={styles.distanceText3}>Lopullinen matka</Text>
                        <Text style={styles.distanceText4}>{(distanceTraveled.current / 1000).toFixed(2)} km</Text>
                        <Text style={styles.distanceText3}>Lopullinen aika</Text>
                        <Text style={styles.distanceText4}>{formatTime(elapsedTime)}</Text>
                        <Text style={styles.distanceText3}>Keskivauhti</Text>
                        <Text style={styles.distanceText4}>{calculateMinutesPerKilometer()} min/km</Text>
                        <Text style={styles.distanceText3}>Keskinopeus</Text>
                        <Text style={styles.distanceText4}>{averageSpeedPerHour.toFixed(2)} km/h</Text>
                      </View>
                      <View style={styles.finalDetailsColumn}>
                        <Text style={styles.distanceText3}>Päivämäärä</Text>
                        <Text style={styles.distanceText4}>{startTime.toLocaleDateString('fi-FI', { timeZone: 'UTC' })}</Text>
                        <Text style={styles.distanceText3}>Lenkin alkamisaika</Text>
                        <Text style={styles.distanceText4}>{startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Text>
                        <Text style={styles.distanceText3}>Lenkin päättymisaika</Text>
                        <Text style={styles.distanceText4}>{endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.buttonContainer}>
                {!saveButtonVisible && (
                  <>
                    <TouchableOpacity onPress={stopTracking} disabled={!tracking} style={styles.appButtonContainer2}>
                      <Text style={styles.buttonText2}>Lopeta lenkki</Text>
                    </TouchableOpacity>
                    {pauseButtonVisible && (
                      <TouchableOpacity onPress={pauseTracking} style={styles.appButtonContainer3}>
                        <Text style={styles.buttonText2}>Pysäytä lenkki</Text>
                      </TouchableOpacity>
                    )}
                    {!pauseButtonVisible && (
                      <TouchableOpacity onPress={resumeTracking} style={styles.appButtonContainer4}>
                        <Text style={styles.buttonText2}>Jatka lenkkiä</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                {saveButtonVisible && (
                  <>
                    <TouchableOpacity onPress={saveTracking} style={styles.appButtonContainer4}>
                      <Text style={styles.buttonText2}>Tallenna lenkki</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={eraseTrackingInfo} style={styles.appButtonContainer2}>
                      <Text style={styles.buttonText2}>Poista lenkki</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container2: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  startContainer: {
    alignItems: 'left',
    justifyContent: 'center',
    padding: 10,
    flex: 4
  },
  map: {
    width: '100%',
    height: '70%',
    flex: 6
  },
  trackerContainer: {
    alignItems: 'left',
    justifyContent: 'top',
    padding: 10,
    flex: 4
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 10,
    margin: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  appButtonContainer1: {
    elevation: 4,
    backgroundColor: "#009688",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 70,
    width: '80%',
  },
  appButtonContainer2: {
    elevation: 4,
    backgroundColor: "#ff0000",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10, 
    width: 180,
  },
  appButtonContainer3: {
    elevation: 4,
    backgroundColor: "#ffa500",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10, 
    width: 180,
  },
  appButtonContainer4: {
    elevation: 4,
    backgroundColor: "#009688",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    width: 180,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "bold",
    alignSelf: "center",
    color: "#fff",
    textTransform: "uppercase"
  },
  buttonText2: {
    fontSize: 14,
    fontWeight: "bold",
    alignSelf: "center",
    color: "#fff",
    textTransform: "uppercase"
  },
  markerImage: {
    width: 35,
    height: 35
  },
  distanceText1: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    alignSelf: "flex-start"

  },
  distanceText2: {
    fontSize: 27,
    fontWeight: "bold",
    alignSelf: "flex-start"
  },
  distanceText3: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    alignSelf: "flex-start"
  },
  distanceText4: {
    fontSize: 23,
    fontWeight: "bold",
    alignSelf: "flex-start"
  },
  finalDetailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    padding: 10
  },
  trackingContainer: {
    justifyContent: 'space-between',
    flex: 1,
    padding: 10
  },
  finalDetailsColumn: {
    flex: 1,
    justifyContent: 'flex-start'
  },
})

export default TrackerScreen;
