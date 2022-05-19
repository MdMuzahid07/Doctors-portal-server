const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
require('dotenv').config()
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())








// mongodb codes

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.espoj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// verify token


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}




// making sendgrid function to email user onclick appoinment

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));


function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your Appointment  ${patientName}  on ${date} at ${slot} is confirm`,
        text: `Your Appointment  ${patientName}  on ${date} at ${slot} is confirm`,
        html: `
        <div>
            <p>Hello ${patientName}</p>
            <h2>Your Appointment for ${treatment} in confirmed</h2>
            <h2>looking forward to seeing you on ${date} at ${slot}</h2>
            <h3>Our Address</h3>
            <p>Dhaka Bangladesh</p>
            <a href="https://www.programming-hero.com/">Unsubscribe</a>
        </div>
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}

// for payment success email

function sendPaymentConfirmationEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `We haved recived your payment for ${patientName}  on ${date} at ${slot} is confirm`,
        text: `Your payment for this appointment  ${patientName}  on ${date} at ${slot} is confirm`,
        html: `
        <div>
            <p>Hello ${patientName}</p>
            <h2>Thank you for your Your payment.</h2>
            <h2>We have received your payment</h2>
            <h2>looking forward to seeing you on ${date} at ${slot}</h2>
            <h3>Our Address</h3>
            <p>Dhaka Bangladesh</p>
            <a href="https://www.programming-hero.com/">Unsubscribe</a>
        </div>
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}



async function run() {
    console.log("db connected?")


    try {
        await client.connect();

        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        // for store user
        const userCollection = client.db('doctors_portal').collection('users');
        // for store doctor
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        // for store payment / transaction
        const paymentCollection = client.db('doctors_portal').collection('payments');


        // to verify admin

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });

            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }



        // to get all services/ but here using project thats why you will get only 
        // service name and _id

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();

            res.send(services)
        })

        // to get users on dashboard
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })


        // to check , is user already admin or not
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === "admin";
            res.send({ admin: isAdmin })
        })


        // to make a user/ give a user admin roll

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        });




        // user update or create new user

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);

            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7h' })


            res.send({ result, token });
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
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        })


        // for loading data by payment appointment id

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
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


            console.log('sending email')
            sendAppointmentEmail(booking)

            // res.send(result)
            return res.send({ success: true, result })
        })




        // to post doctors data on the database
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const getDoctor = req.body;
            const result = await doctorCollection.insertOne(getDoctor);
            res.send(result);
        })

        // to delete a doctor 
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })



        // to show doctors data on dashboard

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })


        // payment intent api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({ clientSecret: paymentIntent.client_secret })

        });

        //

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);
            res.send(updateDoc)

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