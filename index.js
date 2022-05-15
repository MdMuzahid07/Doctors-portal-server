const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const cors = require('cors');
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())








// mongodb codes

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.espoj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {



    try {
        await client.connect();

        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');

        // for store user
        const userCollection = client.db('doctors_portal').collection('users');


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();

            res.send(services)
        })


        // user update or create new user
        app.put('/user/:email', async(req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email}
            const options = {upsert: true}

            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter,updateDoc, options );

            res.send(result);

        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
              $set: user,
            };

            const result = await userCollection.updateOne(filter,updateDoc, options );

            res.send(result);
          })



        // warning 
        // this is not the proper way to query.
        // After learning more about mongodb. use aggregate lookup, pipeline, match, group

        // to load available services

        app.get('/available', async (req, res) => {
            const date = req.query.date; // use hardcoded date if need for fix issues==================>=>======

            // step 1: get all services

            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of that day

            const query = { date: date };

            const bookings = await bookingCollection.find(query).toArray();



            // step 3: for each service , find bookings for that service
            services.forEach(service => {

                // step 4: find bookings for that service
                const serviceBookings = bookings.filter(book => book.treatment === service.name);

                
                // step 5: select slots for the service bookings
                const booked = serviceBookings.map(book => book.slot);

                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !booked.includes(slot));

                // step 7: set available to slots to make it easier
                service.slots = available;


            })



            res.send(services)


        })





        /***
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') // for update one 
         * app.put('/booking/:id') // upsert ==> update (if exists) or insert (if doesn't exist)
         * app.delete('/booking/:id') // for delete one 
         */


      
        // for load user appointments info on dashboard
                app.get('/booking', async(req ,res) => {
                    const patient = req.query.patient;
                    const query = { patient: patient };
                    const bookings = await bookingCollection.find(query).toArray();
                    res.send(bookings)
                })
      


        app.post('/booking', async (req, res) => {
            const booking = req.body;

            // // for handle duplicate service of one user user 
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            // -------------------------------------------

            const result = await bookingCollection.insertOne(booking);
            // res.send(result)
            return res.send({ success: true, result })
        })



    }
    finally {

    }
}
run().catch(console.dir)






app.get('/', (req, res) => {
    res.send("server running?")
})



app.listen(port, () => {
    console.log("server running on port", port);
})