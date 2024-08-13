import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Image } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polyline, Marker } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons'; //Ikonit tietokannan kuvaa varten
import { openDatabase } from "react-native-sqlite-storage";
import { useFocusEffect } from '@react-navigation/native';

const db = openDatabase({ name: 'trackerDatabase.db' });

const HistoryScreen = () => {
  const [trackingHistory, setTrackingHistory] = useState([]); //Kaikkien lenkkien tiedot, jotka tulostetaan ruudulle
  const [selectedRun, setSelectedRun] = useState(null); // Valitun lenkin tiedot
  const [modalVisible, setModalVisible] = useState(false); // Modaali-ikkunan näkyvyys
  const [confirmDeleteModalVisible, setConfirmDeleteModalVisible] = useState(false); // Vahvistusmodaalin näkyvyys
  const [runToDelete, setRunToDelete] = useState(null); // Poistettavan lenkin ID

  useEffect(() => { //Luodaan SQLite table
    db.transaction((tx) => {
      tx.executeSql(
        'CREATE TABLE IF NOT EXISTS trackerDatabase (id INTEGER PRIMARY KEY AUTOINCREMENT, pvm TEXT NOT NULL, aloitusAika TEXT NOT NULL, lopetusAika TEXT NOT NULL, matkaPituus REAL NOT NULL, lopullinenAika REAL NOT NULL, keskiVauhti REAL NOT NULL, keskiNopeus REAL NOT NULL, reittiKoordinaatit TEXT)',
        []
      );
    });
    fetchTrackingHistory(); // Haetaan kaikki historiatiedot
  }, []);

  useFocusEffect( //Tällä saadaan päivitettyä ruudun tiedot joka kerta, kun ruutu avataan.
    useCallback(() => {
      fetchTrackingHistory(); //Ajetaan tietokannan tietojen haku joka kerta, kun ruutu avataan.
    }, [])
  );

  const fetchTrackingHistory = () => { //Kaikkien lenkkihistoriatietojen haku
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM trackerDatabase',
        [],
        (tx, results) => {
          let history = [];
          for (let i = 0; i < results.rows.length; i++) {
            history.push(results.rows.item(i));
          }
          history.sort((a, b) => b.id - a.id); //Lajitellaan näytettävät lenkit käänteisessä järjestyksessä eli uusin näkyy ylhäällä ensimmäisenä
          setTrackingHistory(history);
        },
        error => {
          console.log('Error: ' + error.message);
        }
      );
    });
  };

  const confirmDeleteRun = (id) => { //Lenkin poistamisen vahvistusmodaalin näyttäminen
    setRunToDelete(id);
    setConfirmDeleteModalVisible(true);
  };

  const eraseRunFromDatabase = () => { //Lenkin poistaminen tietokannasta
    if (runToDelete === null) return;

    db.transaction(tx => {
      tx.executeSql(
        'DELETE FROM trackerDatabase WHERE id = ?',
        [runToDelete],
        () => {
          console.log(`Lenkki id:llä ${runToDelete} poistettu onnistuneesti`);
          fetchTrackingHistory(); // Päivitetään uudestaan lenkkihistoriatiedot
          setConfirmDeleteModalVisible(false);
          setRunToDelete(null);
        },
        error => {
          console.log('Virhe poistettaessa lenkkiä id:llä: ' + error.message);
        }
      );
    });
  };

  const openRunDetails = (run) => { //Kun valitaan tarkasteltava lenkki
    setSelectedRun(run);
    setModalVisible(true);
  };

  const closeRunDetails = () => { //Kun suljetaan tarkasteltava lenkki
    setSelectedRun(null);
    setModalVisible(false);
  };

  const parseCoordinates = (coords) => { //Muunnetaan tietokannasta haetut koordinaatit JSON-muotoon
    try {
      return JSON.parse(coords);
    } catch (e) {
      console.log('Error parsing coordinates:', e);
      return [];
    }
  };

  const calculateRegion = (coordinates) => { //Lasketaan lenkin tallennetuista koordinaateista kartan keskipiste, sijainti ja oikea "zoomaus" kartan sijainnin määrittämiseksi. Tämä on netistä kopioitu.
    if (coordinates.length === 0) return null;

    let minLat = coordinates[0].latitude, maxLat = coordinates[0].latitude;
    let minLon = coordinates[0].longitude, maxLon = coordinates[0].longitude;

    coordinates.forEach(coord => {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLon = Math.min(minLon, coord.longitude);
      maxLon = Math.max(maxLon, coord.longitude);
    });

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: (maxLat - minLat) * 1.1,
      longitudeDelta: (maxLon - minLon) * 1.1,
    };
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.historyContainer} contentContainerStyle={styles.scrollViewContent}>
        {trackingHistory.map((item, index) => (
          <Fragment key={item.id}> 
            <TouchableOpacity onPress={() => openRunDetails(item)}>
              <View style={styles.historyContainer2}>
                <View style={styles.historyItem}>
                  <Icon name="run-circle" size={60} color="#cc9900" />
                </View>
                <View style={styles.historyItem}>
                  <Text style={styles.text1}>{item.pvm}</Text>
                  <Text style={styles.text1}>{item.matkaPituus} km</Text>
                </View>
                <View style={styles.historyItem}>
                  <Text style={styles.text1}>{item.lopullinenAika}</Text>
                  <Text style={styles.text1}>{item.keskiVauhti} min/km</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.historyItem2}>
              <TouchableOpacity onPress={() => confirmDeleteRun(item.id)} style={styles.appButtonContainer1}>
                <Text style={styles.buttonText}>Poista lenkki</Text>
              </TouchableOpacity>
            </View>

            {index < trackingHistory.length - 1 && (
              <View style={styles.separator} />
            )}
          </Fragment>
        ))}
      </ScrollView>

      {selectedRun && ( //Kun on valittu tarkasteltava lenkki. Avataan modal-näkymä. Tämä poikkeaa alkuperäisestä suunnitelmasta.
        <Modal
          visible={modalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={closeRunDetails} //Jos käyttäjä painaa puhelimen takaisinpainiketta, niin tehdään sama toiminto kuin ohjelmoitua käyttäjäpainiketta painettaessa.
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <MapView
                style={styles.map}
                mapType={"standard"}
                provider={PROVIDER_GOOGLE}
                showsMyLocationButton={false}
                showsUserLocation={false}
                region={calculateRegion(parseCoordinates(selectedRun.reittiKoordinaatit))}
              >
                <Polyline
                  coordinates={parseCoordinates(selectedRun.reittiKoordinaatit)}
                  strokeWidth={4}
                  strokeColor={"#ff0000"}
                />
                {parseCoordinates(selectedRun.reittiKoordinaatit).length > 0 && (
                  <>
                    <Marker coordinate={parseCoordinates(selectedRun.reittiKoordinaatit)[0]}
                    anchor={{ x: 0.5, y: 0.5 }} //Tämä auttoi pitämään markerin keskellä tietä, koska oli hieman väärässä sijainnissa
                    >
                    <Image source= {require('../images/play_button.png')}
                    style={styles.trackMarker}
                    />
              </Marker>
                    <Marker coordinate={parseCoordinates(selectedRun.reittiKoordinaatit)[parseCoordinates(selectedRun.reittiKoordinaatit).length - 1]}
                    anchor={{ x: 0.5, y: 0.5 }} //Tämä auttoi pitämään markerin keskellä tietä, koska oli hieman väärässä sijainnissa
                    >
                    <Image source= {require('../images/stop_button.png')}
                    style={styles.trackMarker}
                    />
              </Marker>
                  </>
                )}
              </MapView>
              <View style={styles.detailsContainer}>
                <View style={styles.detailsColumn}>
                  <Text style={styles.modalText}>Matka</Text>
                  <Text style={styles.modalText2}>{selectedRun.matkaPituus} km</Text>
                  <Text style={styles.modalText}>Kesto</Text>
                  <Text style={styles.modalText2}>{selectedRun.lopullinenAika}</Text>
                  <Text style={styles.modalText}>Keskivauhti</Text>
                  <Text style={styles.modalText2}>{selectedRun.keskiVauhti} min/km</Text>
                  <Text style={styles.modalText}>Keskinopeus</Text>
                  <Text style={styles.modalText2}>{selectedRun.keskiNopeus} km/h</Text>
                </View>
                <View style={styles.detailsColumn}>
                  <Text style={styles.modalText}>Päivämäärä</Text>
                  <Text style={styles.modalText2}>{selectedRun.pvm}</Text>
                  <Text style={styles.modalText}>Aloitusaika</Text>
                  <Text style={styles.modalText2}>{selectedRun.aloitusAika}</Text>
                  <Text style={styles.modalText}>Lopetusaika</Text>
                  <Text style={styles.modalText2}>{selectedRun.lopetusAika}</Text>
                </View>
              </View>
              <View style={styles.buttonContainer}>
                <TouchableOpacity onPress={closeRunDetails} style={styles.appButtonContainer1}>
                  <Text style={styles.buttonText2}>Sulje lenkki</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {confirmDeleteModalVisible && ( //Kun valitaan tietokannasta poistettava lenkki avataan vahvistusikkuna. Tätä ei ollut alkuperäisessä suunnitelmassa. 
        <Modal
          visible={confirmDeleteModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setConfirmDeleteModalVisible(false)}
        >
          <View style={styles.modalContainer2}>
            <View style={styles.modalContent2}>
              <Text style={styles.modalText3}>Haluatko varmasti poistaa lenkin?</Text>
              <View style={styles.buttonContainer2}>
                <TouchableOpacity onPress={eraseRunFromDatabase} style={styles.appButtonContainer2}>
                  <Text style={styles.buttonText2}>Kyllä</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmDeleteModalVisible(false)} style={styles.appButtonContainer3}>
                  <Text style={styles.buttonText2}>Ei</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
          )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { //Koko sivu
    flex: 1,
    justifyContent: 'center',
  },
  historyContainer: { //Scrollview container
    flex: 1,
    padding: 30,
    backgroundColor: '#ffffff',
  },
  scrollViewContent: { //Lisätty tyylitila alaosaan
    paddingBottom: 50, // Lisätään tyhjää tilaa alaosaan
  },
  historyContainer2: { //Koko lenkkihistorian yksittäisen lenkin tekstikentän container
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 15,
    backgroundColor: '#ffffff',
  },
  historyItem: { //Koko lenkkihistorian tekstilokeron muotoilut
    justifyContent: 'center', //keskitetään tekstit pystysuunnassa

  },
  historyItem2: { //Koko lenkkihistorian painikekentän muotoilut
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  text1: { //Koko lenkkihistorian tekstin muotoilu
    alignSelf: "flex-start",
    fontSize: 15,
    fontWeight: "bold",
  },
  buttonText: { //Poista lenkki -painikkeen tekstin muotoilut
    fontSize: 14,
    fontWeight: "bold",
    alignSelf: "center",
    color: "#fff",
    textTransform: "uppercase"
  },
  buttonText2: { //Sulje lenkki -painikkeen tekstin muotoilut
    fontSize: 15,
    fontWeight: "bold",
    alignSelf: "center",
    color: "#fff",
    textTransform: "uppercase"
  },
  appButtonContainer1: { //Sulje lenkki -painikkeen muotoilut
    elevation: 4,
    backgroundColor: "#009688",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    width: 180,
  },
  appButtonContainer2: { //Poista lenkki kyllä-painikkeen muotoilut
    elevation: 4,
    backgroundColor: "#ff0000",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    width: 120,
  },
  appButtonContainer3: { //Poista lenkki ei-painikkeen muotoilut
    elevation: 4,
    backgroundColor: "#009688",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    width: 120,
  },
  separator: { //Koko lenkkihistorian erottaja
    height: 1,
    backgroundColor: '#cccccc',
    marginVertical: 20,
  },
  modalContainer: { //Modal ikkunan muotoilut
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer2: { //Modal ikkunan muotoilut
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: { //Lenkin poisto modal ikkunan sisällön muotoilut
    backgroundColor: '#ffffff',
    borderRadius: 0,
    width: '100%',
    height: '100%',
    alignItems: 'center',
  },
  modalContent2: { //Lenkin poisto modal ikkunan sisällön muotoilut
    backgroundColor: '#ffffff',
    width: '80%',
    height: '20%',
    alignItems: 'center',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    padding: 20,

  },
  modalText: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    alignSelf: "flex-start"
  },
  modalText2: {
    fontSize: 23,
    fontWeight: "bold",
    alignSelf: "flex-start"
  },
  modalText3: { //Lenkin poisto modal ikkunan tekstin muotoilut
    fontSize: 18,
    fontWeight: "bold",
    alignSelf: "center",
  },
  map: {
    width: '100%',
    height: '60%',
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    padding: 15
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'flex-start'
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  buttonContainer2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  trackMarker: {
    width: 25,
    height: 25,
  },
});

export default HistoryScreen;
