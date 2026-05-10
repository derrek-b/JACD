import Card from 'react-bootstrap/Card'

import demo from '../demo_vid.mp4'

const DemoVideo = () => {
  return (
    <Card className='my-4 mx-auto' style={{ maxWidth: '700px' }}>
      <Card.Header as='h3'>Demo Video</Card.Header>
      <Card.Body className='text-center'>
        <video controls width='100%' style={{ maxWidth: '600px', border: '1px solid black' }}>
          <source src={demo} type='video/mp4' />
          Your browser does not support the video tag.
        </video>
      </Card.Body>
    </Card>
  )
}

export default DemoVideo
