import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons'; // Ikonit selainpalkkiin
import { openDatabase } from "react-native-sqlite-storage"; // Tietokanta
import { activateKeepAwake, deactivateKeepAwake } from "@sayem314/react-native-keep-awake"; // Näyttö pysyy päällä koko aika

import TrackerScreen from './screens/TrackerScreen';
import HistoryScreen from './screens/HistoryScreen';

const db = openDatabase({ name: 'trackerDatabase.db' }); // Haetaan trackerdatabase

const Tab = createBottomTabNavigator();

const MyTabs = () => {
  
  useEffect(() => { // Luodaan SQLite-taulu
    db.transaction((tx) => {
      tx.executeSql(
        'CREATE TABLE IF NOT EXISTS trackerDatabase (id INTEGER PRIMARY KEY AUTOINCREMENT, pvm TEXT NOT NULL, aloitusAika TEXT NOT NULL, lopetusAika TEXT NOT NULL, matkaPituus REAL NOT NULL, lopullinenAika REAL NOT NULL, keskiVauhti REAL NOT NULL, keskiNopeus REAL NOT NULL, reittiKoordinaatit TEXT)',
        []
      );
    });

    activateKeepAwake();

    return () => {
      deactivateKeepAwake();
    };
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#FFFFFF', height: '12%' },
          tabBarLabelStyle: {
            color: '#000000',
            fontWeight: 'bold',
          },
          tabBarShowLabel: false,
        }}>
        <Tab.Screen
          name="Tracker"
          component={TrackerScreen}
          options={{
            title: 'Tracker',
            tabBarIcon: ({ color, size }) => (
              <Icon name="home-outline" color={'#000000'} size={38} style={{ alignSelf: 'center', marginTop: -15 }} />
            ),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            title: 'History',
            tabBarIcon: ({ color, size }) => (
              <Icon name="calendar-outline" color={'#000000'} size={38} style={{ alignSelf: 'center', marginTop: -15 }} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default MyTabs;
