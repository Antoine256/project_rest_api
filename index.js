const { createClient, fetchExchange } =  require('@urql/core');
const express = require('express');
const axios = require('axios');
const {vehicleListQuery} = require('./vehicleQuery');
const {vehicleDetailsQuery} = require('./vehicleDetailsQuery');
const cors = require('cors');
const app = express();
const { DOMParser } = require('xmldom');

app.use(cors())
app.use(express.json());

//const soapUrl = "https://antoine256-project-soap-api.azurewebsites.net/wsdl"
const soapUrl = "http://localhost:3080/wsdl"
const PORT = process.env.PORT || 3000;


app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.get('/vehicles', function (req, res){
    let headers = {
        'x-client-id': '65a0ec8803f11572e9c6ac69',
        'x-app-id': '65a0ec8803f11572e9c6ac6b',
      };

      let client = createClient({
        url: 'https://api.chargetrip.io/graphql',
        fetchOptions: {
          method: 'POST',
          headers,
        },
        exchanges: [fetchExchange],
      });
      client
        .query(vehicleListQuery.loc.source.body, { page: 1,size: 50,search:  '' })
        .toPromise()
        .then((response) => {
          res.status(200).send({data: response.data})
        })
        .catch((error) => console.log(error));
});

app.post('/road', async function (req, res) {
    console.log("request road");

    if (req.body.path === undefined) {
        res.status(400).send({error: "No path specified"});
        return;
    }
    if (req.body.path.length < 2) {
        res.status(400).send({error: "Not enough points specified"});
        return;
    }
    if (req.body.vehicleId === undefined){
        res.status(400).send({error: "No Vehicle specified"});
        return;
    }

    let response = null;
    let vehicleDetails = null;
    let data = [];
    let path = req.body.path;

    try {

        data = []
        path.forEach((e) => {
            data.push([e.geo.center.longitude, e.geo.center.latitude]);
        })

        response = await getRoad(data);

        //On récupère les données du véhicule
        vehicleDetails = await getVehicleDetails(req.body.vehicleId);
    }
    catch (e) {
        console.log(e);
        res.status(500).send({error: "An error occured"});
        return;
    }

    //nombre de kilometre que le véhicule peut parcourir vehicleDetails.vehicle.range.chargetrip_range.worst

    let stations = []
    let possibleStations = [];
    let tab = response.features[0].geometry.coordinates;
    let distance = response.features[0].properties.summary.distance;

    // console.log(distance);
    // console.log(vehicleDetails.vehicle.range.chargetrip_range.worst);
    // console.log(Math.floor(distance / (1000*vehicleDetails.vehicle.range.chargetrip_range.worst)+1));

    nbi = Math.floor(tab.length /(Math.floor(distance / (1000*vehicleDetails.vehicle.range.chargetrip_range.worst)+1)+1))
    for (let i = nbi; i < tab.length; i += nbi) {
        let station = await getBornes(tab[i]);
        //! choisir une seule station !!!
        station.results.forEach((e) => {
            let isAlready = false;
            possibleStations.forEach((s) => {
                if (s.id_station === e.id_station) {
                    isAlready = true;
                }
            })
          if (e.geo_point_borne !== undefined && !isAlready) {
            possibleStations.push(e);
          }
        });
    }
    //console.log(possibleStations.length);
    possibleStations.forEach((e) => {
        stations.push([
            e.geo_point_borne.lon,
            e.geo_point_borne.lat,
        ])
        //console.log(stations[stations.length - 1]);
    });

    let finalPath = [];
    finalPath.push(data[0]);

    stations.forEach((e) => {
        finalPath.push(e);
    })

    finalPath.push(data[data.length - 1]);


    let finalRoad = await getRoad(finalPath);

    // console.log(finalRoad.features[0].geometry.coordinates.length);

    let time = await requestTime(finalRoad.features[0].properties.summary.duration, stations.length);
    console.log(time);
    if (time === null){
        time = undefined;
    }
    let resData = {
        road: finalRoad.features[0].geometry.coordinates,
        time: time,
        stations: stations
    }
    res.status(200).send(resData);
})

async function getRoad(data){

    let res = await axios.post("https://api.openrouteservice.org/v2/directions/driving-car/geojson",
         {"coordinates": data}, {headers: {
                "Authorization": "5b3ce3597851110001cf62487d326cc3ef9445429b2b98878d8e9224",
                "Content-Type": 'application/json; charset=utf-8',
                "Accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8"
            },})
    return res.data;
}

async function getBornes(coord){
    let url = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/bornes-irve/records?where=distance(geo_point_borne%2C%20geom%27POINT("+coord[0]+"%20"+coord[1]+")%27%2C%20"+10+"km)&limit=1"
    let res = await axios.get(url)
    return res.data;
}
async function getVehicleDetails(id){
    let headers = {
        'x-client-id': '65a0ec8803f11572e9c6ac69',
        'x-app-id': '65a0ec8803f11572e9c6ac6b',
      };

      let client = createClient({
        url: 'https://api.chargetrip.io/graphql',
        fetchOptions: {
          method: 'POST',
          headers,
        },
        exchanges: [fetchExchange],
      });
      let res = await client.query(vehicleDetailsQuery.loc.source.body, { vehicleId: id }).toPromise();
      return res.data;
}

async function requestTime(time, stations) {
    let xml = "<?xml version='1.0' encoding='utf-8'?>" +
        "<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/' xmlns:web='urn:example:my-service'>" +
        "<soapenv:Header/>" +
        "<soapenv:Body> " +
        "<urn:MyFunctionRequest> " +
        "<urn:time>"+time +"</urn:time> " +
        "<urn:stations>"+ stations +"</urn:stations>"+
        "</urn:MyFunctionRequest> " +
        "</soapenv:Body> " +
        "</soapenv:Envelope>"

    //await axios.post(soapUrl, xml, {
    try{
        let response =  await axios.post(soapUrl, xml, {
            headers: {
                'Content-Type': 'text/xml;charset=UTF-8',
                'SOAPAction': 'urn:example:my-service#MyFunction', // Vérifiez le SOAPAction dans votre WSDL
            },
        });
        const xmlDoc = new DOMParser().parseFromString(response.data, 'text/xml');
        return xmlDoc.getElementsByTagName('data')[0].textContent;
    }catch (e){
        console.log(e);
        return null;
    }
}

app.listen(PORT, function () {
  console.log('Example app listening on port '+PORT+' !');
});
